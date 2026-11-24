import {
  normalizeSnapshot,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
  type NormalizedGraph,
} from "@permitgraph/evaluator";
import { z } from "zod";

export const SEARCH_LIMITS = { defaultLimit: 25, maxLimit: 100, maxQuery: 200 } as const;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(SEARCH_LIMITS.maxQuery).optional(),
    kind: z.enum(["principal", "group", "resource"]).optional(),
    type: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(SEARCH_LIMITS.maxLimit).default(SEARCH_LIMITS.defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** How well a node matched the text query; lower is better. */
export type MatchRank = "exact" | "prefix" | "contains";
const RANK_ORDER: Record<MatchRank, number> = { exact: 0, prefix: 1, contains: 2 };

export interface NodeHit extends GraphNode {
  /** Absent when there was no text query. */
  match?: MatchRank;
}

export interface SearchResult {
  nodes: NodeHit[];
  /** Matches before paging. */
  total: number;
  limit: number;
  offset: number;
}

/**
 * Searches the nodes of a normalized graph. The text query matches the id
 * or the label, case-insensitively; exact matches come first, then prefix
 * matches, then substring matches, each ordered by kind and id so paging is
 * stable. `kind` and `type` narrow the result.
 */
export function searchNodes(graph: NormalizedGraph, query: SearchQuery): SearchResult {
  const needle = query.q ? query.q.toLowerCase() : "";
  const type = query.type?.toLowerCase();
  const hits: { node: GraphNode; rank?: MatchRank }[] = [];

  for (const node of graph.nodes) {
    if (query.kind && node.kind !== query.kind) continue;
    if (type && node.type.toLowerCase() !== type) continue;
    if (!needle) {
      hits.push({ node });
      continue;
    }
    const rank = matchRank(node, needle);
    if (rank) hits.push({ node, rank });
  }

  // Nodes are already sorted by kind then id, so a stable sort on rank alone keeps that order.
  if (needle) hits.sort((a, b) => RANK_ORDER[a.rank!] - RANK_ORDER[b.rank!]);

  const page = hits.slice(query.offset, query.offset + query.limit);
  return {
    nodes: page.map(({ node, rank }) => (rank ? { ...node, match: rank } : { ...node })),
    total: hits.length,
    limit: query.limit,
    offset: query.offset,
  };
}

function matchRank(node: GraphNode, needle: string): MatchRank | undefined {
  let best: MatchRank | undefined;
  for (const text of [node.id.toLowerCase(), node.label.toLowerCase()]) {
    const rank: MatchRank | undefined =
      text === needle ? "exact" : text.startsWith(needle) ? "prefix" : text.includes(needle) ? "contains" : undefined;
    if (rank && (!best || RANK_ORDER[rank] < RANK_ORDER[best])) best = rank;
  }
  return best;
}

export interface NodeNeighbourhood {
  node: GraphNode;
  /** Edges that start at the node: its memberships and the grants it holds. */
  outgoing: GraphEdge[];
  /** Edges that end at the node: a group's members, a resource's grants. */
  incoming: GraphEdge[];
  /**
   * The nodes at the other end of those edges, each once, in graph order
   * (kind, then id), so a client can label them without more requests.
   */
  neighbours: GraphNode[];
}

/** The node and its direct edges, or null when the id is not in the graph. */
export function nodeNeighbourhood(graph: NormalizedGraph, nodeId: string): NodeNeighbourhood | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const outgoing = graph.edges.filter((e) => e.from === nodeId);
  const incoming = graph.edges.filter((e) => e.to === nodeId);
  const neighbourIds = new Set([...outgoing.map((e) => e.to), ...incoming.map((e) => e.from)]);
  neighbourIds.delete(nodeId);
  return {
    node,
    outgoing,
    incoming,
    neighbours: graph.nodes.filter((n) => neighbourIds.has(n.id)),
  };
}

/**
 * Normalized graphs of stored snapshots, keyed by snapshot id. Snapshots
 * never change, so an entry never goes stale; the cache is only bounded in
 * size (least recently used entry dropped first).
 */
export class NormalizedGraphCache {
  private readonly entries = new Map<string, NormalizedGraph>();

  constructor(private readonly maxEntries = 16) {}

  get(snapshotId: string, graph: GraphSnapshot): NormalizedGraph {
    const cached = this.entries.get(snapshotId);
    if (cached) {
      this.entries.delete(snapshotId);
      this.entries.set(snapshotId, cached);
      return cached;
    }
    const normalized = normalizeSnapshot(graph);
    this.entries.set(snapshotId, normalized);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return normalized;
  }

  get size(): number {
    return this.entries.size;
  }
}
