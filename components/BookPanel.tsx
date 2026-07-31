"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink, X } from "lucide-react";
import type { BookChunk } from "@/lib/types";
import { clsx } from "clsx";

type BookPanelProps = {
  chunk: BookChunk | undefined;
  chunks: BookChunk[];
  onSelect: (id: string) => void;
  onClose?: () => void;
};

export function BookPanel({ chunk, chunks, onSelect, onClose }: BookPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (!chunk) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex w-full shrink-0 items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            <BookOpen size={13} className="text-accent" />
            Study Reference
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Close study reference panel"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex flex-1 items-center px-4 pb-4">
          <a
            href="https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Organic_Chemistry_%28OpenStax%29/17%3A_Alcohols_and_Phenols"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <ExternalLink size={12} className="text-accent" />
            Open Alcohols and Phenols overview
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex w-full shrink-0 items-center justify-between px-4 py-3.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <BookOpen size={13} className="shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Study Reference
            </p>
            <p className="truncate text-sm font-medium text-foreground">{chunk.sourceTitle}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <ChevronDown
            size={15}
            onClick={() => setExpanded((v) => !v)}
            className={clsx(
              "cursor-pointer text-muted transition-transform",
              expanded && "rotate-180"
            )}
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Close study reference panel"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <a
            href={chunk.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
            title={chunk.url}
          >
            <ExternalLink size={11} className="shrink-0 text-accent" />
            <span className="truncate">Open on {chunk.sourceName}</span>
          </a>
          <p className="mt-3 text-xs font-medium text-muted">{chunk.section}</p>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {chunk.text}
          </p>

          {chunks.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {chunks.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={clsx(
                    "truncate rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                    c.id === chunk.id
                      ? "border-accent/50 bg-accent-dim text-accent-strong"
                      : "border-border-subtle text-muted hover:border-border-strong hover:text-foreground"
                  )}
                  title={c.section}
                >
                  {c.sourceTitle}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
