import { buildGraph } from "./graph.js";
import type {
  Grant,
  GraphSnapshot,
  Group,
  MembershipEdge,
  NodeKind,
  Permission,
  Principal,
  PrincipalKind,
  Resource,
} from "./model.js";
import { PERMISSIONS } from "./model.js";

/**
 * One vertex of the normalized graph. `type` is the finer-grained kind:
 * `user`/`service` for principals, `group` for groups and the snapshot's
 * own resource kind (e.g. `repository`) for resources.
 */
export interface GraphNode {
  id: string;
  kind: NodeKind;
  type: string;
  /** Display name, or the id when the snapshot has none. */
  label: string;
}

export type EdgeKind = "member_of" | "grant";

export interface MemberOfEdge {
  id: string;
  kind: "member_of";
  /** member (principal or group) */
  from: string;
  /** group */
  to: string;
}

export interface GrantEdge {
  id: string;
  kind: "grant";
  /** subject (principal or group) */
  from: string;
  /** resource */
  to: string;
  permission: Permission;
}

export type GraphEdge = MemberOfEdge | GrantEdge;

/**
 * Canonical, order-independent form of a snapshot: one node list and one
 * edge list, both sorted, with duplicate edges removed and stable edge ids.
 * Two snapshots that describe the same graph normalize to equal values no
 * matter how their arrays were ordered.
 */
export interface NormalizedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: {
    principals: number;
    groups: number;
    resources: number;
    memberships: number;
    grants: number;
  };
}

const NODE_KIND_ORDER: Record<NodeKind, number> = { principal: 0, group: 1, resource: 2 };
const EDGE_KIND_ORDER: Record<EdgeKind, number> = { member_of: 0, grant: 1 };

/** Stable id of a membership edge. */
export function memberOfEdgeId(member: string, group: string): string {
  return `member_of:${member}->${group}`;
}

/** Stable id of a grant edge. */
export function grantEdgeId(subject: string, resource: string, permission: Permission): string {
  return `grant:${permission}:${subject}->${resource}`;
}

/**
 * Validates the snapshot with `buildGraph` (so it throws the same
 * `GraphError`s) and returns its normalized form.
 */
export function normalizeSnapshot(snapshot: GraphSnapshot): NormalizedGraph {
  const graph = buildGraph(snapshot);

  const nodes: GraphNode[] = [];
  for (const p of graph.principals.values()) {
    nodes.push({ id: p.id, kind: "principal", type: p.kind, label: labelOf(p.id, p.displayName) });
  }
  for (const g of graph.groups.values()) {
    nodes.push({ id: g.id, kind: "group", type: "group", label: labelOf(g.id, g.displayName) });
  }
  for (const r of graph.resources.values()) {
    nodes.push({ id: r.id, kind: "resource", type: r.kind, label: labelOf(r.id, r.displayName) });
  }
  nodes.sort((a, b) => NODE_KIND_ORDER[a.kind] - NODE_KIND_ORDER[b.kind] || compare(a.id, b.id));

  const edges: GraphEdge[] = [];
  let memberships = 0;
  for (const [group, members] of graph.membersOf) {
    for (const member of members) {
      edges.push({ id: memberOfEdgeId(member, group), kind: "member_of", from: member, to: group });
      memberships += 1;
    }
  }
  let grants = 0;
  for (const list of graph.grantsOn.values()) {
    for (const g of list) {
      edges.push({
        id: grantEdgeId(g.subject, g.resource, g.permission),
        kind: "grant",
        from: g.subject,
        to: g.resource,
        permission: g.permission,
      });
      grants += 1;
    }
  }
  edges.sort(compareEdges);

  return {
    nodes,
    edges,
    counts: {
      principals: graph.principals.size,
      groups: graph.groups.size,
      resources: graph.resources.size,
      memberships,
      grants,
    },
  };
}

/**
 * Turns a normalized graph back into a snapshot (sorted, without
 * duplicates). `normalizeSnapshot(toSnapshot(n))` equals `n`.
 */
export function toSnapshot(normalized: NormalizedGraph): GraphSnapshot {
  const principals: Principal[] = [];
  const groups: Group[] = [];
  const resources: Resource[] = [];
  const memberships: MembershipEdge[] = [];
  const grants: Grant[] = [];

  for (const n of normalized.nodes) {
    const name = n.label === n.id ? {} : { displayName: n.label };
    if (n.kind === "principal") principals.push({ id: n.id, kind: n.type as PrincipalKind, ...name });
    else if (n.kind === "group") groups.push({ id: n.id, ...name });
    else resources.push({ id: n.id, kind: n.type, ...name });
  }
  for (const e of normalized.edges) {
    if (e.kind === "member_of") memberships.push({ member: e.from, group: e.to });
    else grants.push({ subject: e.from, resource: e.to, permission: e.permission });
  }
  return { principals, groups, memberships, resources, grants };
}

function labelOf(id: string, displayName: string | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : id;
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return (
    EDGE_KIND_ORDER[a.kind] - EDGE_KIND_ORDER[b.kind] ||
    compare(a.from, b.from) ||
    compare(a.to, b.to) ||
    permissionRank(a) - permissionRank(b)
  );
}

function permissionRank(edge: GraphEdge): number {
  return edge.kind === "grant" ? PERMISSIONS.indexOf(edge.permission) : 0;
}

/** Code-unit order, so the result does not depend on the runtime locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
