/**
 * JSON shapes returned by the PermitGraph API (see apps/api/README.md).
 * Kept here instead of importing the evaluator so the UI only depends on
 * the HTTP contract.
 */

export type NodeKind = "principal" | "group" | "resource";
export const NODE_KINDS: readonly NodeKind[] = ["principal", "group", "resource"];

export type Permission = "read" | "write" | "admin";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** `user`/`service`, `group`, or the resource kind such as `repository`. */
  type: string;
  label: string;
}

export interface MemberOfEdge {
  id: string;
  kind: "member_of";
  from: string;
  to: string;
}

export interface GrantEdge {
  id: string;
  kind: "grant";
  from: string;
  to: string;
  permission: Permission;
}

export type GraphEdge = MemberOfEdge | GrantEdge;

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  role?: "OWNER" | "EDITOR" | "VIEWER";
}

export interface SnapshotCounts {
  principals: number;
  groups: number;
  memberships: number;
  resources: number;
  grants: number;
}

export interface SnapshotSummary {
  id: string;
  label: string;
  contentHash: string;
  counts: SnapshotCounts;
  importedBy: string;
  createdAt: string;
}

export interface NodeHit extends GraphNode {
  match?: "exact" | "prefix" | "contains";
}

export interface NodeSearchResult {
  snapshotId: string;
  nodes: NodeHit[];
  total: number;
  limit: number;
  offset: number;
}

export interface NodeNeighbourhood {
  snapshotId: string;
  node: GraphNode;
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
  neighbours: GraphNode[];
}
