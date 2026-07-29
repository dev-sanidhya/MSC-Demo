"use client";

import { Fragment, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { clsx } from "clsx";
import { ChatPanel } from "@/components/ChatPanel";
import { ResizeHandle } from "@/components/ResizeHandle";
import type { PaneEdge, PaneLeaf, PaneNode } from "@/lib/paneTree";
import type { ChatSession } from "@/lib/types";

type SharedProps = {
  sessions: ChatSession[];
  focusedPaneId: string | null;
  thinkingSessionIds: string[];
  isDraggingSession: boolean;
  canSplit: boolean;
  onSend: (sessionId: string, text: string) => void;
  onFocusPane: (leafId: string) => void;
  onClosePane: (leafId: string) => void;
  onOpenVideo: (sessionId: string) => void;
  onOpenBook: (sessionId: string) => void;
  onResizeSplit: (splitId: string, index: number, deltaPercent: number) => void;
};

type PaneTreeProps = SharedProps & { node: PaneNode };

export function PaneTree({ node, ...shared }: PaneTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === "leaf") {
    return <PaneLeafView node={node} {...shared} />;
  }

  const isRow = node.direction === "row";

  return (
    <div
      ref={containerRef}
      className={clsx("flex min-h-0 min-w-0 flex-1", isRow ? "flex-row" : "flex-col")}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <div
            style={{ flexBasis: `${node.sizes[i]}%`, flexGrow: 0, flexShrink: 0 }}
            className="flex min-h-0 min-w-0 flex-col"
          >
            <PaneTree node={child} {...shared} />
          </div>
          {i < node.children.length - 1 && (
            <ResizeHandle
              orientation={isRow ? "vertical" : "horizontal"}
              onResize={(deltaPx) => {
                const size = isRow
                  ? containerRef.current?.clientWidth
                  : containerRef.current?.clientHeight;
                if (!size) return;
                shared.onResizeSplit(node.id, i, (deltaPx / size) * 100);
              }}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function PaneLeafView({
  node,
  sessions,
  focusedPaneId,
  thinkingSessionIds,
  isDraggingSession,
  canSplit,
  onSend,
  onFocusPane,
  onClosePane,
  onOpenVideo,
  onOpenBook,
}: SharedProps & { node: PaneLeaf }) {
  const session = sessions.find((s) => s.id === node.sessionId);
  const isFocused = focusedPaneId === node.id;

  return (
    <div
      onMouseDown={() => onFocusPane(node.id)}
      className={clsx(
        "relative flex min-h-0 min-w-0 flex-1 flex-col",
        isFocused && "ring-1 ring-inset ring-accent/40"
      )}
    >
      <ChatPanel
        session={session}
        isThinking={session ? thinkingSessionIds.includes(session.id) : false}
        onSend={(text) => session && onSend(session.id, text)}
        onClose={() => onClosePane(node.id)}
        onOpenVideo={session ? () => onOpenVideo(session.id) : undefined}
        onOpenBook={session ? () => onOpenBook(session.id) : undefined}
      />
      {isDraggingSession && <PaneDropZones leafId={node.id} canSplit={canSplit} />}
    </div>
  );
}

const EDGE_CLASS: Record<PaneEdge, string> = {
  left: "left-0 top-0 h-full w-1/4",
  right: "right-0 top-0 h-full w-1/4",
  top: "left-1/4 top-0 h-1/4 w-1/2",
  bottom: "left-1/4 bottom-0 h-1/4 w-1/2",
  center: "left-1/4 top-1/4 h-1/2 w-1/2",
};

const EDGE_LABEL: Record<PaneEdge, string> = {
  left: "Split side-by-side",
  right: "Split side-by-side",
  top: "Split stacked",
  bottom: "Split stacked",
  center: "Switch this pane",
};

function PaneDropZones({ leafId, canSplit }: { leafId: string; canSplit: boolean }) {
  const edges: PaneEdge[] = ["left", "right", "top", "bottom", "center"];

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {edges.map((edge) => {
        if (edge !== "center" && !canSplit) return null;
        return <PaneDropZone key={edge} leafId={leafId} edge={edge} />;
      })}
    </div>
  );
}

function PaneDropZone({ leafId, edge }: { leafId: string; edge: PaneEdge }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `pane-${leafId}-${edge}`,
    data: { type: "pane-edge", leafId, edge },
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "pointer-events-auto absolute flex items-center justify-center rounded-md border-2 border-dashed transition-colors",
        EDGE_CLASS[edge],
        isOver ? "border-accent bg-accent/20" : "border-transparent hover:border-border-strong hover:bg-white/5"
      )}
    >
      {isOver && (
        <span className="rounded-full border border-accent bg-background/90 px-2.5 py-1 text-[10px] font-semibold text-accent-strong shadow-lg">
          {EDGE_LABEL[edge]}
        </span>
      )}
    </div>
  );
}
