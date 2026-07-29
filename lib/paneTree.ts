// A minimal tiling-window-manager tree for chat panes: each leaf shows one
// chat session, each split arranges its children in a row or column with
// resizable percentage widths/heights. Mirrors the mental model of VS Code /
// Codex split panes, scoped down to what this demo needs.

export type PaneLeaf = { type: "leaf"; id: string; sessionId: string };
export type PaneSplit = {
  type: "split";
  id: string;
  direction: "row" | "column";
  children: PaneNode[];
  sizes: number[]; // percentages, sum to 100
};
export type PaneNode = PaneLeaf | PaneSplit;

export type PaneEdge = "left" | "right" | "top" | "bottom" | "center";

let counter = 0;
export function makePaneId(): string {
  counter += 1;
  return `pane-${Date.now().toString(36)}-${counter}`;
}

export function makeLeaf(sessionId: string, id: string = makePaneId()): PaneLeaf {
  return { type: "leaf", id, sessionId };
}

export function countLeaves(node: PaneNode): number {
  if (node.type === "leaf") return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

export function getLeafIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.id];
  return node.children.flatMap(getLeafIds);
}

export function getLeafSessionIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.sessionId];
  return node.children.flatMap(getLeafSessionIds);
}

export function findLeafById(node: PaneNode, leafId: string): PaneLeaf | null {
  if (node.type === "leaf") return node.id === leafId ? node : null;
  for (const child of node.children) {
    const found = findLeafById(child, leafId);
    if (found) return found;
  }
  return null;
}

export function findLeafBySessionId(node: PaneNode, sessionId: string): PaneLeaf | null {
  if (node.type === "leaf") return node.sessionId === sessionId ? node : null;
  for (const child of node.children) {
    const found = findLeafBySessionId(child, sessionId);
    if (found) return found;
  }
  return null;
}

export function replaceLeafSession(node: PaneNode, leafId: string, sessionId: string): PaneNode {
  if (node.type === "leaf") {
    return node.id === leafId ? { ...node, sessionId } : node;
  }
  return { ...node, children: node.children.map((c) => replaceLeafSession(c, leafId, sessionId)) };
}

/**
 * Splits `targetLeafId` into itself plus a new leaf (`newLeafId`/`newSessionId`)
 * along `direction`. If the target is a direct child of a split that already
 * runs in that direction, the new leaf is inserted as a sibling (flat, not
 * nested) — same UX as VS Code adding another column to an existing row.
 */
export function splitLeaf(
  node: PaneNode,
  targetLeafId: string,
  direction: "row" | "column",
  newLeafId: string,
  newSessionId: string,
  position: "before" | "after"
): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== targetLeafId) return node;
    const newLeaf = makeLeaf(newSessionId, newLeafId);
    const children = position === "before" ? [newLeaf, node] : [node, newLeaf];
    return { type: "split", id: makePaneId(), direction, children, sizes: [50, 50] };
  }

  const directIndex = node.children.findIndex((c) => c.type === "leaf" && c.id === targetLeafId);
  if (directIndex !== -1 && node.direction === direction) {
    const newLeaf = makeLeaf(newSessionId, newLeafId);
    const insertAt = position === "before" ? directIndex : directIndex + 1;
    const children = [...node.children];
    children.splice(insertAt, 0, newLeaf);
    const evenSize = 100 / children.length;
    return { ...node, children, sizes: children.map(() => evenSize) };
  }

  return {
    ...node,
    children: node.children.map((c) =>
      splitLeaf(c, targetLeafId, direction, newLeafId, newSessionId, position)
    ),
  };
}

export function removeLeaf(node: PaneNode, leafId: string): PaneNode {
  if (node.type === "leaf") return node;

  const idx = node.children.findIndex((c) => c.type === "leaf" && c.id === leafId);
  let children: PaneNode[];
  let sizes: number[];

  if (idx !== -1) {
    children = node.children.filter((_, i) => i !== idx);
    sizes = node.sizes.filter((_, i) => i !== idx);
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    sizes = sizes.map((s) => (s / total) * 100);
  } else {
    children = node.children.map((c) => removeLeaf(c, leafId));
    sizes = node.sizes;
  }

  if (children.length === 1) return children[0];
  return { ...node, children, sizes };
}

const MIN_PANE_PERCENT = 15;

export function resizeSplitChild(
  node: PaneNode,
  splitId: string,
  index: number,
  deltaPercent: number
): PaneNode {
  if (node.type === "leaf") return node;

  if (node.id === splitId) {
    const sizes = [...node.sizes];
    const a = sizes[index] + deltaPercent;
    const b = sizes[index + 1] - deltaPercent;
    if (a < MIN_PANE_PERCENT || b < MIN_PANE_PERCENT) return node;
    sizes[index] = a;
    sizes[index + 1] = b;
    return { ...node, sizes };
  }

  return { ...node, children: node.children.map((c) => resizeSplitChild(c, splitId, index, deltaPercent)) };
}
