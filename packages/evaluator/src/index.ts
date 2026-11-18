export type {
  GraphSnapshot,
  Group,
  MembershipEdge,
  NodeKind,
  Principal,
  PrincipalKind,
  Resource,
} from "./model.js";
export { buildGraph, GraphError } from "./graph.js";
export type { AccessGraph, GraphErrorCode } from "./graph.js";
export { checkDirectMembership } from "./membership.js";
export type { MembershipOutcome, MembershipResult } from "./membership.js";
