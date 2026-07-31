"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Sidebar } from "@/components/Sidebar";
import { PaneTree } from "@/components/PaneTree";
import { VideoPanel } from "@/components/VideoPanel";
import { BookPanel } from "@/components/BookPanel";
import { ResizeHandle } from "@/components/ResizeHandle";
import { MobileDrawer } from "@/components/MobileDrawer";
import { MobileSheet } from "@/components/MobileSheet";
import { bookChunks, videoChunks } from "@/lib/data";
import { relatedBookChunks, relatedVideoChunks } from "@/lib/retrieval";
import {
  countLeaves,
  findLeafById,
  findLeafBySessionId,
  getLeafIds,
  getLeafSessionIds,
  makeLeaf,
  makePaneId,
  removeLeaf,
  replaceLeafSession,
  resizeSplitChild,
  splitLeaf,
  type PaneNode,
} from "@/lib/paneTree";
import type { ChatMessage, ChatSession } from "@/lib/types";

type ChatApiResponse = {
  content: string;
  videoChunkId: string | null;
  bookChunkId: string | null;
};

function createEmptySession(id: string, title = "New chat"): ChatSession {
  return { id, title, messages: [], createdAt: Date.now() };
}

function createSessionId() {
  return `session-${crypto.randomUUID()}`;
}

function createMessageId() {
  return `msg-${crypto.randomUUID()}`;
}

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 42) return clean;
  return `${clean.slice(0, 42).trimEnd()}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 420;
const RIGHT_MIN = 320;
const RIGHT_MAX = 640;
const MAX_PANES = 4;

const FIRST_SESSION_ID = "session-1";

const STORAGE_KEY = "vibrant-demo-sessions";

export default function Home() {
  // Deliberately NOT read from localStorage here: a useState initializer
  // runs during SSR too, where window/localStorage don't exist, so reading
  // it here would make the server-rendered HTML and the first client
  // render disagree — a hydration mismatch that forces React to tear down
  // and rebuild the whole tree on every load (losing in-flight state,
  // occasionally eating clicks during the rebuild window). Server and the
  // first client render both start from the same plain default; the
  // effect below restores localStorage content right after mount, which is
  // a normal client-side state update, not a hydration mismatch.
  const [sessions, setSessions] = useState<ChatSession[]>(() => [
    createEmptySession(FIRST_SESSION_ID),
  ]);
  const [paneTree, setPaneTree] = useState<PaneNode>(() => makeLeaf(FIRST_SESSION_ID));
  const [focusedPaneIdRaw, setFocusedPaneId] = useState<string | null>(
    () => getLeafIds(makeLeaf(FIRST_SESSION_ID))[0]
  );
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  // Give the actual lecture moment precedence over the supporting book pane.
  // A 60/40 split made a 16:9 player needlessly small whenever both sources
  // were open, especially when the book has no exact matching page.
  const [rightWidth, setRightWidth] = useState(480);
  const [videoPanelHeightPct, setVideoPanelHeightPct] = useState(74);
  const [thinkingSessionIds, setThinkingSessionIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // On mobile the citation sheet covers the whole screen, so unlike the
  // desktop side panel (which can safely auto-show whenever a new answer
  // cites something) it must only open on an explicit tap — otherwise every
  // answer with a citation would yank the just-written reply off-screen the
  // instant it finishes streaming.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);

  useEffect(() => {
    // Restoring from an external system (localStorage) on mount, with no
    // render-time alternative — window/localStorage don't exist during SSR
    // or the first client render, so this can't be derived during render.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as ChatSession[];
      if (saved.length > 0) {
        const usedIds = new Set<string>();
        const restored = saved.map((session) => {
          const id = session.id && !usedIds.has(session.id) ? session.id : createSessionId();
          usedIds.add(id);

          // Early builds used a counter that restarted after a page refresh,
          // leaving some persisted sessions with duplicate React keys.
          const usedMessageIds = new Set<string>();
          const messages = session.messages.map((message) => {
            const messageId =
              message.id && !usedMessageIds.has(message.id) ? message.id : createMessageId();
            usedMessageIds.add(messageId);
            return messageId === message.id ? message : { ...message, id: messageId };
          });

          return { ...session, id, messages };
        });
        setSessions(restored);
        const leaf = makeLeaf(restored[0].id);
        setPaneTree(leaf);
        setFocusedPaneId(getLeafIds(leaf)[0]);
      }
    } catch {
      // Malformed/corrupt storage — keep the plain default session.
    } finally {
      setHasHydratedStorage(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    // Don't persist the pre-hydration default over real saved data — wait
    // until the restore effect above has had its turn.
    if (!hasHydratedStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, hasHydratedStorage]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  // Derived, not stored: if the tree changed underneath the previously
  // focused leaf (e.g. it was closed), fall back to the first remaining leaf
  // without needing a syncing effect.
  const focusedPaneId = useMemo(() => {
    const ids = getLeafIds(paneTree);
    if (focusedPaneIdRaw && ids.includes(focusedPaneIdRaw)) return focusedPaneIdRaw;
    return ids[0] ?? null;
  }, [paneTree, focusedPaneIdRaw]);

  const openPaneSessionIds = useMemo(() => getLeafSessionIds(paneTree), [paneTree]);
  const canSplit = countLeaves(paneTree) < MAX_PANES;

  const focusedSession = useMemo(() => {
    if (!focusedPaneId) return undefined;
    const leaf = findLeafById(paneTree, focusedPaneId);
    return leaf ? sessions.find((s) => s.id === leaf.sessionId) : undefined;
  }, [paneTree, focusedPaneId, sessions]);

  const showVideo = Boolean(focusedSession?.activeVideoChunkId && !focusedSession.videoDismissed);
  const hasCompletedAnswer = Boolean(
    focusedSession?.messages.some(
      (message) => message.role === "assistant" && message.content.trim()
    )
  );
  const showBook = Boolean(hasCompletedAnswer && !focusedSession?.bookDismissed);

  const activeVideoChunk = useMemo(
    () => videoChunks.find((c) => c.id === focusedSession?.activeVideoChunkId),
    [focusedSession]
  );

  const activeBookChunk = useMemo(
    () => bookChunks.find((c) => c.id === focusedSession?.activeBookChunkId),
    [focusedSession]
  );

  const videoChunkOptions = useMemo(() => relatedVideoChunks(activeVideoChunk), [activeVideoChunk]);
  const bookChunkOptions = useMemo(() => relatedBookChunks(activeBookChunk), [activeBookChunk]);

  const openInFocusedPane = useCallback(
    (sessionId: string) => {
      const existingLeaf = findLeafBySessionId(paneTree, sessionId);
      if (existingLeaf) {
        setFocusedPaneId(existingLeaf.id);
        return;
      }
      const targetLeafId = (focusedPaneId && findLeafById(paneTree, focusedPaneId)?.id) ?? getLeafIds(paneTree)[0];
      if (!targetLeafId) return;
      setPaneTree((tree) => replaceLeafSession(tree, targetLeafId, sessionId));
      setFocusedPaneId(targetLeafId);
    },
    [paneTree, focusedPaneId]
  );

  const handleNewChat = useCallback(() => {
    const id = createSessionId();
    const session = createEmptySession(id);
    setSessions((prev) => [session, ...prev]);
    openInFocusedPane(id);
  }, [openInFocusedPane]);

  const handleSelect = useCallback(
    (id: string) => {
      openInFocusedPane(id);
    },
    [openInFocusedPane]
  );

  const handleRename = useCallback((id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      const remaining = sessions.filter((s) => s.id !== id);
      const nextSessions =
        remaining.length > 0 ? remaining : [createEmptySession(createSessionId())];
      const fallbackId = nextSessions[0].id;

      setSessions(nextSessions);
      setPaneTree((tree) => {
        let nextTree = tree;
        for (const leafId of getLeafIds(tree)) {
          if (findLeafById(nextTree, leafId)?.sessionId === id) {
            nextTree = replaceLeafSession(nextTree, leafId, fallbackId);
          }
        }
        return nextTree;
      });
    },
    [sessions]
  );

  const handleClosePane = useCallback((leafId: string) => {
    setPaneTree((tree) => (countLeaves(tree) <= 1 ? tree : removeLeaf(tree, leafId)));
  }, []);

  const handleResizeSplit = useCallback((splitId: string, index: number, deltaPercent: number) => {
    setPaneTree((tree) => resizeSplitChild(tree, splitId, index, deltaPercent));
  }, []);

  const handleSelectVideoChunk = useCallback(
    (id: string) => {
      if (!focusedSession) return;
      const sessionId = focusedSession.id;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, activeVideoChunkId: id, videoDismissed: false } : s))
      );
    },
    [focusedSession]
  );

  const handleSelectBookChunk = useCallback(
    (id: string) => {
      if (!focusedSession) return;
      const sessionId = focusedSession.id;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, activeBookChunkId: id, bookDismissed: false } : s))
      );
    },
    [focusedSession]
  );

  const handleCloseVideoPanel = useCallback(() => {
    if (!focusedSession) return;
    const sessionId = focusedSession.id;
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, videoDismissed: true } : s)));
  }, [focusedSession]);

  const handleCloseBookPanel = useCallback(() => {
    if (!focusedSession) return;
    const sessionId = focusedSession.id;
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, bookDismissed: true } : s)));
  }, [focusedSession]);

  const handleMobileSelect = useCallback(
    (id: string) => {
      handleSelect(id);
      setMobileMenuOpen(false);
    },
    [handleSelect]
  );

  const handleMobileNewChat = useCallback(() => {
    handleNewChat();
    setMobileMenuOpen(false);
  }, [handleNewChat]);

  // Jumps to the exact chunk a given message cited — distinct from
  // handleSelectVideoChunk/handleSelectBookChunk (which always act on
  // whichever pane is currently focused, for the switcher pills in the
  // panel itself). This one is keyed by sessionId so a message's own
  // "Lecture moment"/"Book reference" button always opens THAT message's
  // citation, not whatever the panel happens to be showing right now.
  const handleOpenMessageVideoChunk = useCallback((sessionId: string, chunkId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, activeVideoChunkId: chunkId, videoDismissed: false } : s))
    );
  }, []);

  const handleOpenMessageBookChunk = useCallback((sessionId: string, chunkId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, activeBookChunkId: chunkId, bookDismissed: false } : s))
    );
  }, []);

  const handleOpenVideo = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.activeVideoChunkId
          ? { ...s, videoDismissed: false }
          : s
      )
    );
  }, []);

  const handleOpenBook = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.activeBookChunkId
          ? { ...s, bookDismissed: false }
          : s
      )
    );
  }, []);

  // Thin wrappers so the same "open this citation" actions used by the
  // desktop side panel also surface the mobile sheet — but only on an
  // explicit tap of one of these, never as a side effect of a new answer
  // arriving (see mobileSheetOpen above).
  const handleOpenVideoMobileAware = useCallback(
    (sessionId: string) => {
      handleOpenVideo(sessionId);
      if (isMobile) setMobileSheetOpen(true);
    },
    [handleOpenVideo, isMobile]
  );

  const handleOpenBookMobileAware = useCallback(
    (sessionId: string) => {
      handleOpenBook(sessionId);
      if (isMobile) setMobileSheetOpen(true);
    },
    [handleOpenBook, isMobile]
  );

  const handleOpenMessageVideoChunkMobileAware = useCallback(
    (sessionId: string, chunkId: string) => {
      handleOpenMessageVideoChunk(sessionId, chunkId);
      if (isMobile) setMobileSheetOpen(true);
    },
    [handleOpenMessageVideoChunk, isMobile]
  );

  const handleOpenMessageBookChunkMobileAware = useCallback(
    (sessionId: string, chunkId: string) => {
      handleOpenMessageBookChunk(sessionId, chunkId);
      if (isMobile) setMobileSheetOpen(true);
    },
    [handleOpenMessageBookChunk, isMobile]
  );

  const asideRef = useRef<HTMLDivElement>(null);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => clamp(w + delta, SIDEBAR_MIN, SIDEBAR_MAX));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((w) => clamp(w - delta, RIGHT_MIN, RIGHT_MAX));
  }, []);

  const handleVerticalSplitResize = useCallback((delta: number) => {
    const containerHeight = asideRef.current?.clientHeight ?? 800;
    setVideoPanelHeightPct((pct) => clamp(pct + (delta / containerHeight) * 100, 35, 85));
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingSessionId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingSessionId(null);
      const { active, over } = event;
      if (!over) return;

      const overData = over.data.current as
        | { type?: string; leafId?: string; edge?: "left" | "right" | "top" | "bottom" | "center" }
        | undefined;

      if (overData?.type === "pane-edge" && overData.leafId && overData.edge) {
        const sessionId = String(active.id);
        const { leafId, edge } = overData;

        if (edge === "center") {
          setPaneTree((tree) => replaceLeafSession(tree, leafId, sessionId));
          setFocusedPaneId(leafId);
          return;
        }

        setPaneTree((tree) => {
          if (countLeaves(tree) >= MAX_PANES) return tree;
          const direction = edge === "left" || edge === "right" ? "row" : "column";
          const position = edge === "left" || edge === "top" ? "before" : "after";
          const newLeafId = makePaneId();
          const next = splitLeaf(tree, leafId, direction, newLeafId, sessionId, position);
          setFocusedPaneId(newLeafId);
          return next;
        });
        return;
      }

      // Otherwise this is a sidebar reorder drag.
      if (active.id === over.id) return;
      const oldIndex = sessions.findIndex((s) => s.id === active.id);
      const newIndex = sessions.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      setSessions((prev) => arrayMove(prev, oldIndex, newIndex));
    },
    [sessions]
  );

  const handleSend = useCallback((sessionId: string, text: string) => {
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const isFirstMessage = s.messages.length === 0;
        return {
          ...s,
          title: isFirstMessage ? deriveTitle(text) : s.title,
          messages: [...s.messages, userMessage],
          activeVideoChunkId: undefined,
          activeBookChunkId: undefined,
          videoDismissed: false,
          bookDismissed: false,
        };
      })
    );

    setThinkingSessionIds((prev) => [...prev, sessionId]);

    const history = (sessions.find((session) => session.id === sessionId)?.messages ?? [])
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    const assistantMessageId = createMessageId();
    setSessions((prev) => prev.map((s) => s.id === sessionId ? {
      ...s,
      messages: [...s.messages, { id: assistantMessageId, role: "assistant", content: "", createdAt: Date.now() }],
    } : s));

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || `Request failed (${res.status})`
          );
        }
        if (!res.body) throw new Error("The assistant returned no response stream.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        let sources: Omit<ChatApiResponse, "content"> = { videoChunkId: null, bookChunkId: null };
        const processEvent = (event: string) => {
          const data = event.replace(/^data: /, "");
          if (!data || data === "[DONE]") return;
          const payload = JSON.parse(data) as {
            type: string;
            content?: string;
            videoChunkId?: string | null;
            bookChunkId?: string | null;
          };
          if (payload.type === "token" && payload.content) {
            content += payload.content;
            setSessions((prev) => prev.map((s) => s.id === sessionId ? {
              ...s,
              messages: s.messages.map((m) => m.id === assistantMessageId ? { ...m, content } : m),
            } : s));
          }
          if (payload.type === "sources") {
            sources = {
              videoChunkId: payload.videoChunkId ?? null,
              bookChunkId: payload.bookChunkId ?? null,
            };
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          events.forEach(processEvent);
          if (done && buffer.trim()) processEvent(buffer);
          if (done) break;
        }
        return { content, ...sources };
      })
      .then((reply) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) => m.id === assistantMessageId ? {
                    ...m,
                    content: reply.content || "Sorry, I couldn't generate an answer. Please retry.",
                    videoChunkId: reply.videoChunkId ?? undefined,
                    bookChunkId: reply.bookChunkId ?? undefined,
                  } : m),
                  activeVideoChunkId: reply.videoChunkId ?? undefined,
                  activeBookChunkId: reply.bookChunkId ?? undefined,
                  videoDismissed: reply.videoChunkId ? false : s.videoDismissed,
                  bookDismissed: reply.bookChunkId ? false : s.bookDismissed,
                }
              : s
          )
        );
      })
      .catch((err: Error) => {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? {
            ...s,
            activeVideoChunkId: undefined,
            activeBookChunkId: undefined,
            messages: s.messages.map((m) => m.id === assistantMessageId ? {
              ...m,
              content: `### Couldn’t generate that answer\n\n${err.message}\n\nTry again in a moment.`,
            } : m),
          } : s))
        );
      })
      .finally(() => {
        setThinkingSessionIds((prev) => prev.filter((id) => id !== sessionId));
      });
  }, [sessions]);

  const showAside = showVideo || showBook;

  return (
    <DndContext
      id="app-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingSessionId(null)}
    >
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        {!isMobile && <Sidebar
          sessions={sessions}
          activeSessionId={focusedSession?.id ?? ""}
          openPaneIds={openPaneSessionIds}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          draggable
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          onSelect={handleSelect}
          onNew={handleNewChat}
          onRename={handleRename}
          onDelete={handleDeleteSession}
        />}

        {!isMobile && !sidebarCollapsed && <ResizeHandle onResize={handleSidebarResize} />}

        <main className="flex min-w-0 flex-1">
          <PaneTree
            node={paneTree}
            sessions={sessions}
            focusedPaneId={focusedPaneId}
            thinkingSessionIds={thinkingSessionIds}
            isDraggingSession={draggingSessionId !== null}
            canSplit={canSplit}
            onSend={handleSend}
            onFocusPane={setFocusedPaneId}
            onClosePane={handleClosePane}
            onOpenVideo={handleOpenVideoMobileAware}
            onOpenBook={handleOpenBookMobileAware}
            onOpenVideoChunk={handleOpenMessageVideoChunkMobileAware}
            onOpenBookChunk={handleOpenMessageBookChunkMobileAware}
            onResizeSplit={handleResizeSplit}
            onMenuClick={isMobile ? () => setMobileMenuOpen(true) : undefined}
          />

          {showAside && !isMobile && (
            <>
              <ResizeHandle onResize={handleRightResize} />

              <aside
                ref={asideRef}
                style={{ width: rightWidth }}
                className="flex shrink-0 flex-col border-l border-border-subtle bg-surface/60"
              >
                {showVideo && (
                  <div
                    style={{ height: showBook ? `${videoPanelHeightPct}%` : "100%" }}
                    className="flex min-h-0 flex-col overflow-y-auto"
                  >
                    <VideoPanel
                      chunk={activeVideoChunk}
                      chunks={videoChunkOptions}
                      onSelect={handleSelectVideoChunk}
                      onClose={handleCloseVideoPanel}
                    />
                  </div>
                )}

                {showVideo && showBook && (
                  <ResizeHandle orientation="horizontal" onResize={handleVerticalSplitResize} />
                )}

                {showBook && (
                  <div
                    style={{ height: showVideo ? `${100 - videoPanelHeightPct}%` : "100%" }}
                    className="flex min-h-0 flex-col border-t border-border-subtle first:border-t-0"
                  >
                    <BookPanel
                      chunk={activeBookChunk}
                      chunks={bookChunkOptions}
                      onSelect={handleSelectBookChunk}
                      onClose={handleCloseBookPanel}
                    />
                  </div>
                )}
              </aside>
            </>
          )}
        </main>
      </div>

      <MobileDrawer open={isMobile && mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        <Sidebar
          sessions={sessions}
          activeSessionId={focusedSession?.id ?? ""}
          openPaneIds={openPaneSessionIds}
          collapsed={false}
          width={280}
          draggable={false}
          onToggleCollapsed={() => setMobileMenuOpen(false)}
          onSelect={handleMobileSelect}
          onNew={handleMobileNewChat}
          onRename={handleRename}
          onDelete={handleDeleteSession}
        />
      </MobileDrawer>

      <MobileSheet
        open={isMobile && mobileSheetOpen && showAside}
        onClose={() => setMobileSheetOpen(false)}
      >
        {showVideo && (
          <VideoPanel
            chunk={activeVideoChunk}
            chunks={videoChunkOptions}
            onSelect={handleSelectVideoChunk}
            onClose={handleCloseVideoPanel}
          />
        )}
        {showBook && (
          <BookPanel
            chunk={activeBookChunk}
            chunks={bookChunkOptions}
            onSelect={handleSelectBookChunk}
            onClose={handleCloseBookPanel}
          />
        )}
      </MobileSheet>
    </DndContext>
  );
}
