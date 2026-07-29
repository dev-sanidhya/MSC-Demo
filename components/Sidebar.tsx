"use client";

import { useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  MessageSquarePlus,
  Pencil,
  Check,
  Trash2,
} from "lucide-react";
import type { ChatSession } from "@/lib/types";
import { clsx } from "clsx";

type SidebarProps = {
  sessions: ChatSession[];
  activeSessionId: string;
  openPaneIds: string[];
  collapsed: boolean;
  width: number;
  onToggleCollapsed: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

function SortableSessionRow({
  session,
  isActive,
  isOpenInPane,
  collapsed,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  isOpenInPane: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: session.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitRename() {
    const trimmed = draft.trim();
    onRename(session.id, trimmed.length > 0 ? trimmed : session.title);
    setEditing(false);
  }

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        style={{ ...style, touchAction: "none" }}
        {...attributes}
        {...listeners}
        onClick={() => onSelect(session.id)}
        title={session.title}
        className={clsx(
          "flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition-colors cursor-grab active:cursor-grabbing",
          isActive
            ? "bg-accent-dim text-accent-strong border border-accent/40"
            : "text-muted hover:bg-surface-2 hover:text-foreground",
          isDragging && "opacity-50"
        )}
      >
        {session.title.slice(0, 1).toUpperCase()}
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "none" }}
      {...attributes}
      {...listeners}
      className={clsx(
        "group flex cursor-grab items-start gap-1.5 rounded-md px-2 py-2 text-left transition-colors active:cursor-grabbing",
        isActive
          ? "bg-surface-2 border border-border-strong"
          : "border border-transparent hover:bg-surface-2/60",
        isDragging && "opacity-50"
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical size={14} />
      </span>
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        className="min-w-0 flex-1 text-left"
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                setDraft(session.title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-accent/50 bg-background px-1 py-0.5 text-sm font-medium text-foreground outline-none"
          />
        ) : (
          <span className="flex items-center gap-1.5">
            {isOpenInPane && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                title="Open in a pane"
              />
            )}
            <p
              className={clsx(
                "truncate text-sm font-medium",
                isActive ? "text-foreground" : "text-foreground/80"
              )}
            >
              {session.title}
            </p>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(session.title);
          setEditing((v) => !v);
        }}
        className="mt-0.5 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        aria-label="Rename chat"
      >
        {editing ? <Check size={13} /> : <Pencil size={13} />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
        className="mt-0.5 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
        aria-label="Delete chat"
        title="Delete chat"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function Sidebar({
  sessions,
  activeSessionId,
  openPaneIds,
  collapsed,
  width,
  onToggleCollapsed,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: SidebarProps) {
  return (
    <aside
      style={{ width: collapsed ? 56 : width }}
      className="flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface"
    >
      <div
        className={clsx(
          "flex items-center border-b border-border-subtle px-3 py-3",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Sessions
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={onNew}
          className={clsx(
            "flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent-strong",
            collapsed ? "h-9 w-9 justify-center" : "w-full px-3 py-2"
          )}
          title="New chat"
        >
          <MessageSquarePlus size={15} />
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <SortableContext
          items={sessions.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={clsx("flex flex-col", collapsed ? "gap-1.5 items-center" : "gap-1")}>
            {sessions.map((session) => (
              <SortableSessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                isOpenInPane={openPaneIds.includes(session.id)}
                collapsed={collapsed}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        </SortableContext>
      </div>

      {!collapsed && (
        <div className="border-t border-border-subtle px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            Vibrant Academy · Kota
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-2/70">
            Drag a chat into the main view to open it side-by-side
          </p>
        </div>
      )}
    </aside>
  );
}
