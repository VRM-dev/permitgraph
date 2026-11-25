import { PERMISSIONS } from "./model.js";
import type { Grant, Group, GraphSnapshot, MembershipEdge, NodeKind, Principal, Resource } from "./model.js";

export type GraphErrorCode =
  | "DUPLICATE_ID"
  | "UNKNOWN_MEMBER"
  | "UNKNOWN_GROUP"
  | "UNKNOWN_SUBJECT"
  | "UNKNOWN_RESOURCE"
  | "INVALID_PERMISSION";

export class GraphError extends Error {
  readonly code: GraphErrorCode;
  readonly ref: string;

  constructor(code: GraphErrorCode, ref: string, message: string) {
    super(message);
    this.name = "GraphError";
    this.code = code;
    this.ref = ref;
  }
}

/**
 * Indexed, read-only view of a snapshot. Node ids are unique across
 * principals, groups and resources so that edges are never ambiguous.
 */
export interface AccessGraph {
  readonly principals: ReadonlyMap<string, Principal>;
  readonly groups: ReadonlyMap<string, Group>;
  readonly resources: ReadonlyMap<string, Resource>;
  /** group id -> ids of its direct members, in input order */
  readonly membersOf: ReadonlyMap<string, readonly string[]>;
  /** member id -> ids of the groups it belongs to directly, in input order */
  readonly groupsOf: ReadonlyMap<string, readonly string[]>;
  /** resource id -> grants on it, duplicates removed, in input order */
  readonly grantsOn: ReadonlyMap<string, readonly Grant[]>;
  /** subject id -> grants it holds directly, duplicates removed, in input order */
  readonly grantsHeldBy: ReadonlyMap<string, readonly Grant[]>;
  kindOf(id: string): NodeKind | undefined;
}

export function buildGraph(snapshot: GraphSnapshot): AccessGraph {
  const kinds = new Map<string, NodeKind>();

  function register<T extends { id: string }>(items: readonly T[], kind: NodeKind): Map<string, T> {
    const index = new Map<string, T>();
    for (const item of items) {
      const existing = kinds.get(item.id);
      if (existing !== undefined) {
        throw new GraphError("DUPLICATE_ID", item.id, `Id "${item.id}" is used by more than one node (${existing}, ${kind})`);
      }
      kinds.set(item.id, kind);
      index.set(item.id, item);
    }
    return index;
  }

  const principals = register(snapshot.principals, "principal");
  const groups = register(snapshot.groups, "group");
  const resources = register(snapshot.resources, "resource");

  const membersOf = new Map<string, string[]>();
  const groupsOf = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const edge of snapshot.memberships) {
    validateEdge(edge, kinds);
    const key = `${edge.member}\u0000${edge.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    append(membersOf, edge.group, edge.member);
    append(groupsOf, edge.member, edge.group);
  }

  const grantsOn = new Map<string, Grant[]>();
  const grantsHeldBy = new Map<string, Grant[]>();
  const seenGrants = new Set<string>();

  for (const grant of snapshot.grants ?? []) {
    validateGrant(grant, kinds);
    const key = `${grant.subject}\u0000${grant.resource}\u0000${grant.permission}`;
    if (seenGrants.has(key)) continue;
    seenGrants.add(key);
    const copy: Grant = { subject: grant.subject, resource: grant.resource, permission: grant.permission };
    append(grantsOn, grant.resource, copy);
    append(grantsHeldBy, grant.subject, copy);
  }

  return {
    principals,
    groups,
    resources,
    membersOf,
    groupsOf,
    grantsOn,
    grantsHeldBy,
    kindOf: (id) => kinds.get(id),
  };
}

function validateEdge(edge: MembershipEdge, kinds: ReadonlyMap<string, NodeKind>): void {
  if (kinds.get(edge.group) !== "group") {
    throw new GraphError("UNKNOWN_GROUP", edge.group, `Membership of "${edge.member}" points to unknown group "${edge.group}"`);
  }
  const memberKind = kinds.get(edge.member);
  if (memberKind !== "principal" && memberKind !== "group") {
    throw new GraphError("UNKNOWN_MEMBER", edge.member, `Group "${edge.group}" lists unknown member "${edge.member}"`);
  }
}

function validateGrant(grant: Grant, kinds: ReadonlyMap<string, NodeKind>): void {
  const subjectKind = kinds.get(grant.subject);
  if (subjectKind !== "principal" && subjectKind !== "group") {
    throw new GraphError("UNKNOWN_SUBJECT", grant.subject, `Grant on "${grant.resource}" names unknown subject "${grant.subject}"`);
  }
  if (kinds.get(grant.resource) !== "resource") {
    throw new GraphError("UNKNOWN_RESOURCE", grant.resource, `Grant to "${grant.subject}" points to unknown resource "${grant.resource}"`);
  }
  if (!(PERMISSIONS as readonly string[]).includes(grant.permission)) {
    throw new GraphError(
      "INVALID_PERMISSION",
      grant.permission,
      `Grant to "${grant.subject}" on "${grant.resource}" has unsupported permission "${grant.permission}"`,
    );
  }
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
