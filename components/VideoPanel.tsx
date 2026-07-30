"use client";

import { PlayCircle, X } from "lucide-react";
import type { VideoChunk } from "@/lib/types";
import { clsx } from "clsx";

type VideoPanelProps = {
  chunk: VideoChunk | undefined;
  chunks: VideoChunk[];
  onSelect: (id: string) => void;
  onClose?: () => void;
};

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPanel({ chunk, chunks, onSelect, onClose }: VideoPanelProps) {
  if (!chunk) {
    return (
      <div className="flex flex-1 items-center justify-center border-b border-border-subtle text-sm text-muted">
        No lecture clip yet
      </div>
    );
  }

  const embedUrl = `https://www.youtube.com/embed/${chunk.videoId}?start=${chunk.startSeconds}&autoplay=0`;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto border-b border-border-subtle">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          <PlayCircle size={13} className="text-accent" />
          Lecture Clip
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
            {chunk.lecture} · {formatTimestamp(chunk.startSeconds)}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
              aria-label="Close lecture clip panel"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-2.5">
        <p className="text-sm font-medium text-foreground">{chunk.topic}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
          Why this clip: matched from &ldquo;{chunk.videoTitle}&rdquo; because it covers the
          concept directly relevant to your question — deep-linked to the exact minute, not
          the full lecture.
        </p>
      </div>

      <div className="mx-4 aspect-video overflow-hidden rounded-lg border border-border-subtle bg-black">
        <iframe
          key={chunk.id}
          src={embedUrl}
          title={chunk.videoTitle}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {chunks.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
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
              title={c.topic}
            >
              {c.lecture} · {c.topic}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
