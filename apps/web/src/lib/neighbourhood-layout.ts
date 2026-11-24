import type { GraphEdge, GraphNode, NodeKind } from "./types";

/** A neighbour placed in one column, with the labels of its edges to the centre node. */
export interface PlacedNode {
  /** Unique within the layout: side and node id. */
  key: string;
  node: GraphNode;
  x: number;
  y: number;
  edgeLabels: string[];
}

export interface NeighbourhoodLayout {
  width: number;
  height: number;
  centre: PlacedNode;
  /** Nodes with an edge into the centre node (members, grant holders). */
  left: PlacedNode[];
  /** Nodes the centre node points to (its groups, the resources it holds grants on). */
  right: PlacedNode[];
  hiddenLeft: number;
  hiddenRight: number;
}

export interface LayoutInput {
  node: GraphNode;
  incoming: readonly GraphEdge[];
  outgoing: readonly GraphEdge[];
  neighbours: readonly GraphNode[];
}

export const LAYOUT = {
  width: 760,
  columnX: { left: 140, centre: 380, right: 620 },
  rowHeight: 46,
  padding: 36,
  minHeight: 180,
  maxPerSide: 12,
} as const;

const KIND_ORDER: Record<NodeKind, number> = { principal: 0, group: 1, resource: 2 };

export function edgeLabel(edge: GraphEdge): string {
  return edge.kind === "member_of" ? "member of" : edge.permission;
}

/**
 * Places a node's direct neighbourhood in three columns: incoming edges on
 * the left, the node in the middle, outgoing edges on the right. Several
 * edges to the same neighbour (e.g. read and write on one repository) share
 * one box. Each side is ordered by kind then id and capped at `maxPerSide`;
 * the rest is counted in `hiddenLeft`/`hiddenRight`. A pure function, so the
 * picture is the same for the same input.
 */
export function layoutNeighbourhood(input: LayoutInput, maxPerSide: number = LAYOUT.maxPerSide): NeighbourhoodLayout {
  const byId = new Map(input.neighbours.map((n) => [n.id, n]));
  const lookup = (id: string): GraphNode => byId.get(id) ?? { id, kind: "principal", type: "unknown", label: id };

  const left = group(input.incoming, (e) => e.from, lookup);
  const right = group(input.outgoing, (e) => e.to, lookup);
  const shownLeft = left.slice(0, maxPerSide);
  const shownRight = right.slice(0, maxPerSide);

  const rows = Math.max(shownLeft.length, shownRight.length, 1);
  const height = Math.max(LAYOUT.minHeight, rows * LAYOUT.rowHeight + 2 * LAYOUT.padding);

  const place = (side: "left" | "right", items: Grouped[]): PlacedNode[] => {
    const top = (height - items.length * LAYOUT.rowHeight) / 2 + LAYOUT.rowHeight / 2;
    return items.map((item, i) => ({
      key: `${side}:${item.node.id}`,
      node: item.node,
      x: LAYOUT.columnX[side],
      y: Math.round(top + i * LAYOUT.rowHeight),
      edgeLabels: item.labels,
    }));
  };

  return {
    width: LAYOUT.width,
    height,
    centre: { key: `centre:${input.node.id}`, node: input.node, x: LAYOUT.columnX.centre, y: height / 2, edgeLabels: [] },
    left: place("left", shownLeft),
    right: place("right", shownRight),
    hiddenLeft: left.length - shownLeft.length,
    hiddenRight: right.length - shownRight.length,
  };
}

interface Grouped {
  node: GraphNode;
  labels: string[];
}

function group(edges: readonly GraphEdge[], end: (e: GraphEdge) => string, lookup: (id: string) => GraphNode): Grouped[] {
  const groups = new Map<string, Grouped>();
  for (const edge of edges) {
    const id = end(edge);
    const entry = groups.get(id) ?? { node: lookup(id), labels: [] };
    const label = edgeLabel(edge);
    if (!entry.labels.includes(label)) entry.labels.push(label);
    groups.set(id, entry);
  }
  return [...groups.values()].sort(
    (a, b) => KIND_ORDER[a.node.kind] - KIND_ORDER[b.node.kind] || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0),
  );
}

/** Shortens text for a fixed-width box, keeping the start. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
