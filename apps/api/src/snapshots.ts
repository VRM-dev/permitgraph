import { createHash } from "node:crypto";
import { buildGraph, GraphError, type GraphSnapshot } from "@permitgraph/evaluator";
import { z } from "zod";
import type { SnapshotCounts } from "./domain.js";
import { InvalidSnapshotError } from "./errors.js";

/** Import limits. Larger graphs are rejected before any work is done. */
export const SNAPSHOT_LIMITS = {
  nodesPerKind: 10_000,
  memberships: 50_000,
  bodyBytes: 8 * 1024 * 1024,
} as const;

const nodeId = z.string().min(1).max(200);
const displayName = z.string().max(200).optional();

export const graphSchema = z
  .object({
    principals: z
      .array(z.object({ id: nodeId, kind: z.enum(["user", "service"]), displayName }).strict())
      .max(SNAPSHOT_LIMITS.nodesPerKind),
    groups: z.array(z.object({ id: nodeId, displayName }).strict()).max(SNAPSHOT_LIMITS.nodesPerKind),
    memberships: z.array(z.object({ member: nodeId, group: nodeId }).strict()).max(SNAPSHOT_LIMITS.memberships),
    resources: z
      .array(z.object({ id: nodeId, kind: z.string().min(1).max(64), displayName }).strict())
      .max(SNAPSHOT_LIMITS.nodesPerKind),
  })
  .strict();

export const importSnapshotBody = z
  .object({ label: z.string().trim().min(1).max(120), graph: graphSchema })
  .strict();

export interface PreparedSnapshot {
  graph: GraphSnapshot;
  contentHash: string;
  counts: SnapshotCounts;
}

/**
 * Checks that a snapshot is a consistent graph (unique ids, no dangling
 * edges) using the evaluator itself, then fingerprints it. Throws
 * `InvalidSnapshotError` instead of storing anything the evaluator would
 * later refuse.
 */
export function prepareSnapshot(graph: GraphSnapshot): PreparedSnapshot {
  try {
    buildGraph(graph);
  } catch (error) {
    if (error instanceof GraphError) throw new InvalidSnapshotError(error.code, error.ref, error.message);
    throw error;
  }
  return {
    graph,
    contentHash: snapshotHash(graph),
    counts: {
      principals: graph.principals.length,
      groups: graph.groups.length,
      memberships: graph.memberships.length,
      resources: graph.resources.length,
    },
  };
}

/** `sha256:<hex>` of the canonical JSON: object keys sorted, array order kept. */
export function snapshotHash(graph: GraphSnapshot): string {
  return `sha256:${createHash("sha256").update(canonicalJson(graph)).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
