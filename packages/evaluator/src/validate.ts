import type { GraphErrorCode } from "./graph.js";
import { PERMISSIONS } from "./model.js";
import type { GraphSnapshot, NodeKind } from "./model.js";

export type IssueSeverity = "error" | "warning";

export type GraphWarningCode = "DUPLICATE_MEMBERSHIP" | "DUPLICATE_GRANT";

export interface GraphIssue {
  severity: IssueSeverity;
  code: GraphErrorCode | GraphWarningCode;
  /** The offending id or value. */
  ref: string;
  /** Location in the snapshot, e.g. `memberships[3].group`. */
  path: string;
  message: string;
}

export interface ValidationReport {
  /** True when there are no errors. Warnings do not make a snapshot invalid. */
  valid: boolean;
  errorCount: number;
  warningCount: number;
  /** At most `maxIssues` issues, errors before warnings, each in input order. */
  issues: GraphIssue[];
  /** True when more issues were found than are listed. */
  truncated: boolean;
}

export interface ValidateOptions {
  /** Upper bound on listed issues; counting continues past it. Default 100. */
  maxIssues?: number;
}

/**
 * Checks a whole snapshot and reports every problem instead of stopping at
 * the first one, so an import can be fixed in a single pass. A snapshot is
 * `valid` exactly when `buildGraph` accepts it; the error codes are the
 * `GraphError` codes `buildGraph` would throw. Duplicate edges are only
 * warnings: they are dropped during normalization.
 */
export function validateSnapshot(snapshot: GraphSnapshot, options: ValidateOptions = {}): ValidationReport {
  const maxIssues = options.maxIssues ?? 100;
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];
  const kinds = new Map<string, NodeKind>();

  const nodeLists: ReadonlyArray<[string, NodeKind, readonly { id: string }[]]> = [
    ["principals", "principal", snapshot.principals],
    ["groups", "group", snapshot.groups],
    ["resources", "resource", snapshot.resources],
  ];
  for (const [field, kind, items] of nodeLists) {
    items.forEach((item, i) => {
      const existing = kinds.get(item.id);
      if (existing !== undefined) {
        errors.push(issue("error", "DUPLICATE_ID", item.id, `${field}[${i}].id`, `Id "${item.id}" is already used by a ${existing}`));
        return;
      }
      kinds.set(item.id, kind);
    });
  }

  const seenMemberships = new Set<string>();
  snapshot.memberships.forEach((edge, i) => {
    let ok = true;
    if (kinds.get(edge.group) !== "group") {
      ok = false;
      errors.push(issue("error", "UNKNOWN_GROUP", edge.group, `memberships[${i}].group`, `Unknown group "${edge.group}"`));
    }
    const memberKind = kinds.get(edge.member);
    if (memberKind !== "principal" && memberKind !== "group") {
      ok = false;
      errors.push(issue("error", "UNKNOWN_MEMBER", edge.member, `memberships[${i}].member`, `Unknown member "${edge.member}"`));
    }
    if (!ok) return;
    const key = `${edge.member}\u0000${edge.group}`;
    if (seenMemberships.has(key)) {
      warnings.push(
        issue("warning", "DUPLICATE_MEMBERSHIP", edge.member, `memberships[${i}]`, `"${edge.member}" is listed in "${edge.group}" more than once`),
      );
    }
    seenMemberships.add(key);
  });

  const seenGrants = new Set<string>();
  (snapshot.grants ?? []).forEach((grant, i) => {
    let ok = true;
    const subjectKind = kinds.get(grant.subject);
    if (subjectKind !== "principal" && subjectKind !== "group") {
      ok = false;
      errors.push(issue("error", "UNKNOWN_SUBJECT", grant.subject, `grants[${i}].subject`, `Unknown subject "${grant.subject}"`));
    }
    if (kinds.get(grant.resource) !== "resource") {
      ok = false;
      errors.push(issue("error", "UNKNOWN_RESOURCE", grant.resource, `grants[${i}].resource`, `Unknown resource "${grant.resource}"`));
    }
    if (!(PERMISSIONS as readonly string[]).includes(grant.permission)) {
      ok = false;
      errors.push(
        issue("error", "INVALID_PERMISSION", String(grant.permission), `grants[${i}].permission`, `Unsupported permission "${grant.permission}"`),
      );
    }
    if (!ok) return;
    const key = `${grant.subject}\u0000${grant.resource}\u0000${grant.permission}`;
    if (seenGrants.has(key)) {
      warnings.push(
        issue(
          "warning",
          "DUPLICATE_GRANT",
          grant.subject,
          `grants[${i}]`,
          `"${grant.subject}" is granted ${grant.permission} on "${grant.resource}" more than once`,
        ),
      );
    }
    seenGrants.add(key);
  });

  const all = [...errors, ...warnings];
  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues: all.slice(0, Math.max(0, maxIssues)),
    truncated: all.length > maxIssues,
  };
}

function issue(severity: IssueSeverity, code: GraphIssue["code"], ref: string, path: string, message: string): GraphIssue {
  return { severity, code, ref, path, message };
}
