/**
 * Snapshot input model. Everything the evaluator reasons about is passed in
 * explicitly; the package never reads files, databases or the network.
 */

export type PrincipalKind = "user" | "service";

export interface Principal {
  id: string;
  kind: PrincipalKind;
  displayName?: string;
}

export interface Group {
  id: string;
  displayName?: string;
}

/** `member` (a principal or a group) belongs directly to `group`. */
export interface MembershipEdge {
  member: string;
  group: string;
}

export interface Resource {
  id: string;
  kind: string;
  displayName?: string;
}

/** Permission levels, weakest first. A higher level includes the lower ones. */
export const PERMISSIONS = ["read", "write", "admin"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** `subject` (a principal or a group) holds `permission` on `resource`. */
export interface Grant {
  subject: string;
  resource: string;
  permission: Permission;
}

export interface GraphSnapshot {
  principals: readonly Principal[];
  groups: readonly Group[];
  memberships: readonly MembershipEdge[];
  resources: readonly Resource[];
  /** Optional so snapshots imported before grants existed stay valid. */
  grants?: readonly Grant[];
}

export type NodeKind = "principal" | "group" | "resource";
