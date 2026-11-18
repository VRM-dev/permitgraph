import { GraphError } from "./graph.js";
import type { AccessGraph } from "./graph.js";
import type { MembershipEdge } from "./model.js";

export type MembershipOutcome = "MEMBER" | "NOT_MEMBER";

export interface MembershipResult {
  member: string;
  group: string;
  outcome: MembershipOutcome;
  /** The edge that grants membership; present only when `outcome` is MEMBER. */
  edge?: MembershipEdge;
}

/**
 * Answers "is `member` listed directly in `group`?". Membership inherited
 * through nested groups is not considered here; a group that only reaches
 * `group` through another group is NOT_MEMBER for this query.
 *
 * Ids that are not in the snapshot are caller errors and throw a GraphError,
 * so a typo is never reported as a plain NOT_MEMBER.
 */
export function checkDirectMembership(graph: AccessGraph, member: string, group: string): MembershipResult {
  const memberKind = graph.kindOf(member);
  if (memberKind !== "principal" && memberKind !== "group") {
    throw new GraphError("UNKNOWN_MEMBER", member, `"${member}" is not a principal or group in this snapshot`);
  }
  if (graph.kindOf(group) !== "group") {
    throw new GraphError("UNKNOWN_GROUP", group, `"${group}" is not a group in this snapshot`);
  }

  const groups = graph.groupsOf.get(member) ?? [];
  if (groups.includes(group)) {
    return { member, group, outcome: "MEMBER", edge: { member, group } };
  }
  return { member, group, outcome: "NOT_MEMBER" };
}
