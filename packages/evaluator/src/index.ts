export type {
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
export { PERMISSIONS } from "./model.js";
export { buildGraph, GraphError } from "./graph.js";
export type { AccessGraph, GraphErrorCode } from "./graph.js";
export { checkDirectMembership } from "./membership.js";
export type { MembershipOutcome, MembershipResult } from "./membership.js";
export { grantEdgeId, memberOfEdgeId, normalizeSnapshot, toSnapshot } from "./normalize.js";
export type { EdgeKind, GrantEdge, GraphEdge, GraphNode, MemberOfEdge, NormalizedGraph } from "./normalize.js";
export { validateSnapshot } from "./validate.js";
export type { GraphIssue, GraphWarningCode, IssueSeverity, ValidateOptions, ValidationReport } from "./validate.js";
