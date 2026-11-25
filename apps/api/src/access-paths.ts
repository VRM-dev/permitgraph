import {
  explainAccess,
  grantEdgeId,
  memberOfEdgeId,
  PERMISSIONS,
  type AccessGraph,
  type AccessOutcome,
  type GraphEdge,
  type GraphNode,
  type NormalizedGraph,
  type Permission,
} from "@permitgraph/evaluator";
import { z } from "zod";
import { HttpError } from "./errors.js";

export const ACCESS_LIMITS = { defaultPaths: 20, maxPaths: 50 } as const;

export const accessQuerySchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    resource: z.string().trim().min(1).max(200),
    permission: z.enum(PERMISSIONS).optional(),
    limit: z.coerce.number().int().min(1).max(ACCESS_LIMITS.maxPaths).default(ACCESS_LIMITS.defaultPaths),
  })
  .strict();

export type AccessQuery = z.infer<typeof accessQuerySchema>;

export interface AccessPathJson {
  /** Permission granted at the end of the path. */
  permission: Permission;
  /** Node ids from the subject to the resource. */
  nodes: string[];
  /** The membership edges in order, then the grant edge; ids match the normalized graph. */
  edges: GraphEdge[];
}

export interface AccessPathsJson {
  subject: GraphNode;
  resource: GraphNode;
  permission?: Permission;
  effective: Permission | null;
  outcome: AccessOutcome;
  paths: AccessPathJson[];
  totalPaths: number;
  truncated: boolean;
  /** Every node on the listed paths once, in graph order, for labels. */
  nodes: GraphNode[];
}

/**
 * Explains how `subject` reaches `resource` in one snapshot as JSON for the
 * API: the evaluator's paths turned into node ids and normalized edges.
 * Unknown ids are 404s with a code naming the side that is missing.
 */
export function accessPaths(normalized: NormalizedGraph, access: AccessGraph, query: AccessQuery): AccessPathsJson {
  const subjectKind = access.kindOf(query.subject);
  if (subjectKind !== "principal" && subjectKind !== "group") {
    throw new HttpError(404, "UNKNOWN_SUBJECT", `"${query.subject}" is not a principal or group in this snapshot`);
  }
  if (access.kindOf(query.resource) !== "resource") {
    throw new HttpError(404, "UNKNOWN_RESOURCE", `"${query.resource}" is not a resource in this snapshot`);
  }

  const result = explainAccess(access, query.subject, query.resource, {
    ...(query.permission ? { permission: query.permission } : {}),
    maxPaths: query.limit,
  });

  const paths: AccessPathJson[] = result.paths.map((path) => ({
    permission: path.grant.permission,
    nodes: [...path.via, path.grant.resource],
    edges: [
      ...path.memberships.map(
        (m): GraphEdge => ({ id: memberOfEdgeId(m.member, m.group), kind: "member_of", from: m.member, to: m.group }),
      ),
      {
        id: grantEdgeId(path.grant.subject, path.grant.resource, path.grant.permission),
        kind: "grant",
        from: path.grant.subject,
        to: path.grant.resource,
        permission: path.grant.permission,
      },
    ],
  }));

  const wanted = new Set([query.subject, query.resource, ...paths.flatMap((p) => p.nodes)]);
  const nodes = normalized.nodes.filter((n) => wanted.has(n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return {
    subject: byId.get(query.subject)!,
    resource: byId.get(query.resource)!,
    ...(result.permission ? { permission: result.permission } : {}),
    effective: result.effective,
    outcome: result.outcome,
    paths,
    totalPaths: result.totalPaths,
    truncated: result.truncated,
    nodes,
  };
}
