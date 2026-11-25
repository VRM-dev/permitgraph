import { createHash } from "node:crypto";
import {
  normalizeSnapshot,
  toSnapshot,
  validateSnapshot,
  type GraphSnapshot,
  type ValidationReport,
} from "@permitgraph/evaluator";
import { z } from "zod";
import type { SnapshotCounts } from "./domain.js";
import { InvalidSnapshotError } from "./errors.js";

/** Import limits. Larger graphs are rejected before any work is done. */
export const SNAPSHOT_LIMITS = {
  nodesPerKind: 10_000,
  memberships: 50_000,
  grants: 100_000,
  /** Issues listed in a validation report; the totals are always complete. */
  reportIssues: 100,
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
    // Permission is checked by the evaluator, so an unsupported value is
    // reported with its path like any other graph error.
    grants: z
      .array(z.object({ subject: nodeId, resource: nodeId, permission: z.string().min(1).max(32) }).strict())
      .max(SNAPSHOT_LIMITS.grants)
      .optional(),
  })
  .strict();

export const importSnapshotBody = z
  .object({ label: z.string().trim().min(1).max(120), graph: graphSchema })
  .strict();

export const validateImportBody = z.object({ graph: graphSchema }).strict();

export interface PreparedSnapshot {
  /** The normalized graph: sorted, duplicate edges removed. This is what is stored. */
  graph: GraphSnapshot;
  contentHash: string;
  counts: SnapshotCounts;
}

export interface ImportReport extends ValidationReport {
  /** Present only for valid graphs: what an import would store. */
  counts?: SnapshotCounts;
  contentHash?: string;
}

/**
 * Validates a graph with the evaluator and, if it is valid, adds the counts
 * and content hash of its normalized form. Never stores anything.
 */
export function checkImport(graph: GraphSnapshot): ImportReport {
  const report = validateSnapshot(graph, { maxIssues: SNAPSHOT_LIMITS.reportIssues });
  if (!report.valid) return report;
  const prepared = normalize(graph);
  return { ...report, counts: prepared.counts, contentHash: prepared.contentHash };
}

/**
 * Checks that a snapshot is a consistent graph (unique ids, no dangling
 * edges, known permissions) and returns its normalized form with a
 * fingerprint. Because the graph is normalized first, the same graph gets the
 * same hash whatever order its arrays were in. Throws `InvalidSnapshotError`
 * with the full report instead of storing anything the evaluator would refuse.
 */
export function prepareSnapshot(graph: GraphSnapshot): PreparedSnapshot {
  const report = validateSnapshot(graph, { maxIssues: SNAPSHOT_LIMITS.reportIssues });
  if (!report.valid) throw new InvalidSnapshotError(report);
  return normalize(graph);
}

function normalize(graph: GraphSnapshot): PreparedSnapshot {
  const normalized = normalizeSnapshot(graph);
  const stored = toSnapshot(normalized);
  return {
    graph: stored,
    contentHash: snapshotHash(stored),
    counts: {
      principals: normalized.counts.principals,
      groups: normalized.counts.groups,
      memberships: normalized.counts.memberships,
      resources: normalized.counts.resources,
      grants: normalized.counts.grants,
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
