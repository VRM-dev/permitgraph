import { GraphError } from "./graph.js";
import type { AccessGraph } from "./graph.js";
import { PERMISSIONS } from "./model.js";
import type { Grant, MembershipEdge, Permission } from "./model.js";

export type AccessOutcome = "GRANTED" | "NOT_GRANTED";

/**
 * One way `subject` reaches `resource`: the chain of memberships from the
 * subject to the grant holder (empty for a grant held directly), then the
 * grant itself.
 */
export interface AccessPath {
  /** Node ids from the subject to the grant holder, both included. */
  via: string[];
  memberships: MembershipEdge[];
  grant: Grant;
}

export interface AccessExplanation {
  subject: string;
  resource: string;
  /** The permission asked about; absent when the caller asked for any access. */
  permission?: Permission;
  /** Strongest permission reachable through any path, or null for none. */
  effective: Permission | null;
  /** GRANTED when `effective` meets `permission` (or is any access at all). */
  outcome: AccessOutcome;
  /**
   * Paths that grant at least the requested permission (every path when no
   * permission was given): strongest permission first, then shortest, then
   * by node ids, capped at `maxPaths`.
   */
  paths: AccessPath[];
  /** Number of such paths found before the cap. */
  totalPaths: number;
  /** True when some paths were not listed (cap) or not explored (budget). */
  truncated: boolean;
}

export interface ExplainOptions {
  permission?: Permission;
  /** Most paths returned. Default 20. */
  maxPaths?: number;
  /** Longest membership chain followed. Default 32. */
  maxDepth?: number;
  /** Bound on path extensions explored, so dense graphs stay cheap. Default 10 000. */
  maxSteps?: number;
}

const DEFAULTS = { maxPaths: 20, maxDepth: 32, maxSteps: 10_000 } as const;

function rank(permission: Permission): number {
  return PERMISSIONS.indexOf(permission);
}

/**
 * Explains how `subject` (a principal or a group) reaches `resource`.
 * Membership is transitive: a member of a group holds every grant of that
 * group and of the groups it belongs to. Higher permissions include lower
 * ones. Membership cycles are allowed in snapshots and are not followed
 * twice on one path.
 *
 * `effective` and `outcome` come from plain reachability, so they are exact
 * even when the path list is truncated. Unknown ids throw a GraphError
 * (`UNKNOWN_SUBJECT` / `UNKNOWN_RESOURCE`).
 */
export function explainAccess(
  graph: AccessGraph,
  subject: string,
  resource: string,
  options: ExplainOptions = {},
): AccessExplanation {
  const subjectKind = graph.kindOf(subject);
  if (subjectKind !== "principal" && subjectKind !== "group") {
    throw new GraphError("UNKNOWN_SUBJECT", subject, `"${subject}" is not a principal or group in this snapshot`);
  }
  if (graph.kindOf(resource) !== "resource") {
    throw new GraphError("UNKNOWN_RESOURCE", resource, `"${resource}" is not a resource in this snapshot`);
  }
  const { permission } = options;
  if (permission !== undefined && !(PERMISSIONS as readonly string[]).includes(permission)) {
    throw new GraphError("INVALID_PERMISSION", String(permission), `Unsupported permission "${String(permission)}"`);
  }
  const maxPaths = options.maxPaths ?? DEFAULTS.maxPaths;
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const maxSteps = options.maxSteps ?? DEFAULTS.maxSteps;
  const minRank = permission === undefined ? 0 : rank(permission);

  const grantsHere = (holder: string): Grant[] =>
    (graph.grantsHeldBy.get(holder) ?? []).filter((g) => g.resource === resource);

  // Exact answer first: every group the subject reaches, at any depth.
  const reachable = new Set<string>([subject]);
  const queue = [subject];
  for (let i = 0; i < queue.length; i++) {
    for (const group of graph.groupsOf.get(queue[i]!) ?? []) {
      if (!reachable.has(group)) {
        reachable.add(group);
        queue.push(group);
      }
    }
  }
  let best = -1;
  for (const holder of reachable) {
    for (const g of grantsHere(holder)) best = Math.max(best, rank(g.permission));
  }
  const effective = best >= 0 ? PERMISSIONS[best]! : null;

  // Then the evidence: simple membership chains that end at a matching grant.
  const found: AccessPath[] = [];
  let steps = 0;
  let exhausted = false;
  const onPath = new Set<string>();
  const via: string[] = [];

  const walk = (node: string): void => {
    onPath.add(node);
    via.push(node);
    for (const grant of grantsHere(node)) {
      if (rank(grant.permission) < minRank) continue;
      found.push({
        via: [...via],
        memberships: via.slice(1).map((group, i) => ({ member: via[i]!, group })),
        grant: { ...grant },
      });
    }
    if (via.length <= maxDepth) {
      for (const group of graph.groupsOf.get(node) ?? []) {
        if (onPath.has(group)) continue;
        if (++steps > maxSteps) {
          exhausted = true;
          break;
        }
        walk(group);
        if (exhausted) break;
      }
    } else if ((graph.groupsOf.get(node) ?? []).some((g) => !onPath.has(g))) {
      exhausted = true;
    }
    via.pop();
    onPath.delete(node);
  };
  walk(subject);

  found.sort(comparePaths);
  const outcome: AccessOutcome = best >= minRank ? "GRANTED" : "NOT_GRANTED";
  return {
    subject,
    resource,
    ...(permission !== undefined ? { permission } : {}),
    effective,
    outcome,
    paths: found.slice(0, maxPaths),
    totalPaths: found.length,
    truncated: exhausted || found.length > maxPaths,
  };
}

function comparePaths(a: AccessPath, b: AccessPath): number {
  const byPermission = rank(b.grant.permission) - rank(a.grant.permission);
  if (byPermission !== 0) return byPermission;
  if (a.via.length !== b.via.length) return a.via.length - b.via.length;
  const ka = a.via.join("\u0000");
  const kb = b.via.join("\u0000");
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
