"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, Menu, PlayCircle, Sparkles, X } from "lucide-react";
import type { ChatSession } from "@/lib/types";
import { clsx } from "clsx";
import { MarkdownMessage } from "@/components/MarkdownMessage";

type ChatPanelProps = {
  session: ChatSession | undefined;
  isThinking: boolean;
  onSend: (text: string) => void;
  onClose?: () => void;
  onOpenVideo?: () => void;
  onOpenBook?: () => void;
  onOpenVideoChunk?: (chunkId: string) => void;
  onOpenBookChunk?: (chunkId: string) => void;
  /** Only supplied on mobile — renders a hamburger button that opens the chat list drawer instead of the desktop sidebar. Its presence also signals "mobile context" to this component (e.g. hides the close-pane control, which is meaningless with a single always-open pane). */
  onMenuClick?: () => void;
};

const STARTER_QUESTIONS = [
  "Why do tertiary alcohols react fastest in the Lucas test?",
  "Compare PCC and acidified K2Cr2O7 for oxidation of alcohols.",
  "Explain Grignard addition to an ester step by step.",
  "Why is phenol more acidic than ethanol?",
];

function formatTime(ts: number) {
  const d = new Date(ts);
  const hours24 = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

export function ChatPanel({
  session,
  isThinking,
  onSend,
  onClose,
  onOpenVideo,
  onOpenBook,
  onOpenVideoChunk,
  onOpenBookChunk,
  onMenuClick,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, isThinking]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Capped lower on mobile — 160px of growth room reads fine on a desktop
    // side pane but eats a third of a phone screen once someone pastes a
    // couple of sentences.
    const maxHeight = window.matchMedia("(max-width: 767px)").matches ? 92 : 160;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [draft]);

  function handleSend() {
    const text = draft.trim();
    if (!text || isThinking) return;
    onSend(text);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
        Select or start a chat to begin.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {onMenuClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMenuClick();
              }}
              className="-ml-1 shrink-0 rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Open chat list"
            >
              <Menu size={18} />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{session.title}</p>
            <p className="text-[11px] text-muted-2">
              Vibrant Academy · Chemistry · Alcohols, Phenols &amp; Ethers
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Demo mode
          </div>
          {onOpenVideo && (
            <div className="flex w-14 flex-col items-center gap-0.5 md:w-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenVideo();
                }}
                className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
                aria-label="Open lecture clip"
                title="Open lecture clip"
              >
                <PlayCircle size={14} />
              </button>
              {/* Discoverability nudge for new mobile users — desktop already has
                  the side panel open by default, so this would just be noise there. */}
              <span className="text-center text-[8px] leading-tight text-muted-2 md:hidden">
                New lecture clip
              </span>
            </div>
          )}
          {onOpenBook && (
            <div className="flex w-14 flex-col items-center gap-0.5 md:w-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBook();
                }}
                className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
                aria-label="Open study reference"
                title="Open study reference"
              >
                <BookOpen size={14} />
              </button>
              <span className="text-center text-[8px] leading-tight text-muted-2 md:hidden">
                New study ref
              </span>
            </div>
          )}
          {onClose && !onMenuClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Close pane"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {session.messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={20} className="text-accent" />
            <p className="text-sm text-muted">
              Learn with the exact lecture moment and study reference behind every answer.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {STARTER_QUESTIONS.map((question) => (
                <button key={question} type="button" onClick={() => onSend(question)} className="rounded-full border border-border-subtle bg-surface px-3 py-2 text-left text-xs text-foreground/85 transition-colors hover:border-accent/50 hover:bg-accent-dim">
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {session.messages.map((message) => (
          <div
            key={message.id}
            className={clsx(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={clsx(
                message.role === "user" ? "max-w-[75%]" : "w-full max-w-3xl",
                "rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-accent-dim border border-accent/30 text-foreground"
                  : "bg-surface border border-border-subtle text-foreground/90"
              )}
            >
              {message.role === "assistant" ? (
                <MarkdownMessage content={message.content} />
              ) : (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
              {message.role === "assistant" && (message.videoChunkId || message.bookChunkId) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {message.videoChunkId && onOpenVideoChunk && (
                    <button
                      type="button"
                      onClick={() => onOpenVideoChunk(message.videoChunkId!)}
                      className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-dim px-2.5 py-1 text-[10px] font-semibold text-accent-strong"
                    >
                      <PlayCircle size={12} /> Lecture moment
                    </button>
                  )}
                  {message.bookChunkId && onOpenBookChunk && (
                    <button
                      type="button"
                      onClick={() => onOpenBookChunk(message.bookChunkId!)}
                      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-foreground"
                    >
                      <BookOpen size={12} /> Study reference
                    </button>
                  )}
                </div>
              )}
              <p
                className={clsx(
                  "mt-1.5 font-mono text-[10px]",
                  message.role === "user" ? "text-accent-strong/70" : "text-muted-2"
                )}
              >
                {formatTime(message.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-4 py-3">
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: "150ms" }} />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2 focus-within:border-accent/50">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a doubt about Alcohols, Phenols & Ethers…"
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-2 outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || isThinking}
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              draft.trim() && !isThinking
                ? "bg-accent text-accent-foreground hover:bg-accent-strong"
                : "bg-surface-2 text-muted-2"
            )}
            aria-label="Send message"
          >
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-2">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
