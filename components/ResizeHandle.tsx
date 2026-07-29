"use client";

import { useCallback, useRef } from "react";
import { clsx } from "clsx";

type ResizeHandleProps = {
  orientation?: "vertical" | "horizontal";
  onResize: (delta: number) => void;
  className?: string;
};

export function ResizeHandle({
  orientation = "vertical",
  onResize,
  className,
}: ResizeHandleProps) {
  const last = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      last.current = orientation === "vertical" ? e.clientX : e.clientY;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      function handleMove(ev: PointerEvent) {
        const pos = orientation === "vertical" ? ev.clientX : ev.clientY;
        const delta = pos - last.current;
        last.current = pos;
        onResize(delta);
      }
      function handleUp(ev: PointerEvent) {
        el.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [onResize, orientation]
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
      className={clsx(
        "group relative shrink-0 select-none",
        orientation === "vertical"
          ? "w-2 cursor-col-resize"
          : "h-2 cursor-row-resize",
        className
      )}
    >
      <div
        className={clsx(
          "absolute bg-border-subtle transition-colors group-hover:bg-accent/60 group-active:bg-accent",
          orientation === "vertical"
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2"
        )}
      />
    </div>
  );
}
