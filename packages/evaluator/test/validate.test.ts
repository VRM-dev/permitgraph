import { describe, expect, it } from "vitest";
import { buildGraph, validateSnapshot } from "../src/index.js";
import type { GraphSnapshot } from "../src/index.js";
import { sampleOrg } from "./fixtures/sample-org.js";
import { tinyOrg } from "./fixtures/tiny-org.js";

function accepted(snapshot: GraphSnapshot): boolean {
  try {
    buildGraph(snapshot);
    return true;
  } catch {
    return false;
  }
}

const base: GraphSnapshot = {
  principals: [
    { id: "u-ana", kind: "user" },
    { id: "svc-ci", kind: "service" },
  ],
  groups: [{ id: "g-dev" }],
  memberships: [{ member: "u-ana", group: "g-dev" }],
  resources: [{ id: "repo-api", kind: "repository" }],
  grants: [{ subject: "g-dev", resource: "repo-api", permission: "write" }],
};

describe("validateSnapshot", () => {
  it("accepts the fixtures without issues", () => {
    for (const snapshot of [tinyOrg, sampleOrg, base]) {
      expect(validateSnapshot(snapshot)).toEqual({ valid: true, errorCount: 0, warningCount: 0, issues: [], truncated: false });
    }
  });

  it("reports every error in one pass, with paths", () => {
    const broken: GraphSnapshot = {
      ...base,
      groups: [{ id: "g-dev" }, { id: "u-ana" }],
      memberships: [
        { member: "u-ana", group: "g-dev" },
        { member: "u-ghost", group: "g-missing" },
      ],
      grants: [
        { subject: "g-dev", resource: "repo-api", permission: "write" },
        { subject: "g-nobody", resource: "u-ana", permission: "owner" as never },
      ],
    };
    const report = validateSnapshot(broken);
    expect(report.valid).toBe(false);
    expect(report.issues.map((i) => [i.code, i.path, i.ref])).toEqual([
      ["DUPLICATE_ID", "groups[1].id", "u-ana"],
      ["UNKNOWN_GROUP", "memberships[1].group", "g-missing"],
      ["UNKNOWN_MEMBER", "memberships[1].member", "u-ghost"],
      ["UNKNOWN_SUBJECT", "grants[1].subject", "g-nobody"],
      ["UNKNOWN_RESOURCE", "grants[1].resource", "u-ana"],
      ["INVALID_PERMISSION", "grants[1].permission", "owner"],
    ]);
    expect(report.errorCount).toBe(6);
    expect(report.issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("treats duplicate edges as warnings that keep the snapshot valid", () => {
    const report = validateSnapshot({
      ...base,
      memberships: [...base.memberships, { member: "u-ana", group: "g-dev" }],
      grants: [...(base.grants ?? []), { subject: "g-dev", resource: "repo-api", permission: "write" }],
    });
    expect(report.valid).toBe(true);
    expect(report.issues.map((i) => [i.severity, i.code, i.path])).toEqual([
      ["warning", "DUPLICATE_MEMBERSHIP", "memberships[1]"],
      ["warning", "DUPLICATE_GRANT", "grants[1]"],
    ]);
  });

  it("lists errors before warnings and caps the list", () => {
    const memberships = Array.from({ length: 5 }, () => ({ member: "u-ana", group: "g-dev" }));
    const report = validateSnapshot(
      { ...base, memberships: [...memberships, { member: "u-ana", group: "g-none" }] },
      { maxIssues: 2 },
    );
    expect(report.errorCount).toBe(1);
    expect(report.warningCount).toBe(4);
    expect(report.issues.map((i) => i.code)).toEqual(["UNKNOWN_GROUP", "DUPLICATE_MEMBERSHIP"]);
    expect(report.truncated).toBe(true);
  });

  it("agrees with buildGraph on what is valid", () => {
    const variants: GraphSnapshot[] = [
      base,
      { ...base, groups: [{ id: "repo-api" }] },
      { ...base, memberships: [{ member: "repo-api", group: "g-dev" }] },
      { ...base, memberships: [{ member: "u-ana", group: "u-ana" }] },
      { ...base, grants: [{ subject: "repo-api", resource: "repo-api", permission: "read" }] },
      { ...base, grants: [{ subject: "svc-ci", resource: "g-dev", permission: "read" }] },
      { ...base, grants: [{ subject: "svc-ci", resource: "repo-api", permission: "READ" as never }] },
      { principals: base.principals, groups: base.groups, memberships: base.memberships, resources: base.resources },
    ];
    for (const snapshot of variants) {
      expect(validateSnapshot(snapshot).valid).toBe(accepted(snapshot));
    }
  });
});
