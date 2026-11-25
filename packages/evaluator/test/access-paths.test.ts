import { describe, expect, it } from "vitest";
import { buildGraph, explainAccess, GraphError } from "../src/index.js";
import type { GraphSnapshot, Permission } from "../src/index.js";
import { reorder, sampleOrg } from "./fixtures/sample-org.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GraphError) return err.code;
    throw err;
  }
  return undefined;
}

describe("explainAccess on the sample organisation", () => {
  const graph = buildGraph(sampleOrg);

  it("traces a contractor's repository write access through the contractors group", () => {
    const result = explainAccess(graph, "u-contractor-02", "repo-web", { permission: "write" });
    expect(result).toMatchObject({ outcome: "GRANTED", effective: "write", permission: "write", totalPaths: 1, truncated: false });
    expect(result.paths).toEqual([
      {
        via: ["u-contractor-02", "g-contractors"],
        memberships: [{ member: "u-contractor-02", group: "g-contractors" }],
        grant: { subject: "g-contractors", resource: "repo-web", permission: "write" },
      },
    ]);
  });

  it("lists every path when no permission is requested, strongest and shortest first", () => {
    const result = explainAccess(graph, "u-contractor-02", "repo-web");
    expect(result.outcome).toBe("GRANTED");
    expect(result.permission).toBeUndefined();
    expect(result.paths.map((p) => [p.grant.permission, p.via])).toEqual([
      ["write", ["u-contractor-02", "g-contractors"]],
      ["read", ["u-contractor-02", "g-contractors", "g-engineering"]],
    ]);
    expect(result.paths[1]!.memberships).toEqual([
      { member: "u-contractor-02", group: "g-contractors" },
      { member: "g-contractors", group: "g-engineering" },
    ]);
  });

  it("shows a direct grant next to the inherited one", () => {
    const result = explainAccess(graph, "u-contractor-01", "repo-docs");
    expect(result.effective).toBe("write");
    expect(result.paths.map((p) => p.via)).toEqual([["u-contractor-01"], ["u-contractor-01", "g-contractors", "g-engineering"]]);
    expect(result.paths[0]!.memberships).toEqual([]);
  });

  it("follows nested groups to the top of the hierarchy", () => {
    const result = explainAccess(graph, "u-frontend-03", "repo-handbook", { permission: "read" });
    expect(result.paths).toEqual([
      expect.objectContaining({ via: ["u-frontend-03", "g-frontend", "g-engineering", "g-all-staff"] }),
    ]);
  });

  it("reports NOT_GRANTED with the effective permission when it is too weak", () => {
    const result = explainAccess(graph, "u-contractor-02", "repo-api", { permission: "write" });
    expect(result).toMatchObject({ outcome: "NOT_GRANTED", effective: "read", paths: [], totalPaths: 0, truncated: false });
  });

  it("reports NOT_GRANTED with no paths when nothing reaches the resource", () => {
    const result = explainAccess(graph, "u-contractor-02", "repo-ledger");
    expect(result).toMatchObject({ outcome: "NOT_GRANTED", effective: null, paths: [] });
  });

  it("treats admin as including write", () => {
    const result = explainAccess(graph, "u-platform-01", "repo-infra", { permission: "write" });
    expect(result.effective).toBe("admin");
    expect(result.paths.map((p) => p.grant.permission)).toEqual(["admin", "write"]);
  });

  it("accepts a group as the subject", () => {
    const result = explainAccess(graph, "g-contractors", "repo-web");
    expect(result.paths.map((p) => p.via)).toEqual([["g-contractors"], ["g-contractors", "g-engineering"]]);
  });

  it("gives the same answer whatever order the snapshot arrays were in", () => {
    const shuffled: GraphSnapshot = {
      principals: reorder(sampleOrg.principals, 3),
      groups: reorder(sampleOrg.groups, 5),
      memberships: reorder(sampleOrg.memberships, 7),
      resources: reorder(sampleOrg.resources, 11),
      grants: reorder(sampleOrg.grants ?? [], 13),
    };
    const a = explainAccess(graph, "u-contractor-01", "repo-docs");
    const b = explainAccess(buildGraph(shuffled), "u-contractor-01", "repo-docs");
    expect(b).toEqual(a);
  });

  it("throws for unknown ids and permissions instead of answering NOT_GRANTED", () => {
    expect(codeOf(() => explainAccess(graph, "u-nobody", "repo-web"))).toBe("UNKNOWN_SUBJECT");
    expect(codeOf(() => explainAccess(graph, "repo-web", "repo-api"))).toBe("UNKNOWN_SUBJECT");
    expect(codeOf(() => explainAccess(graph, "u-ceo", "g-engineering"))).toBe("UNKNOWN_RESOURCE");
    expect(codeOf(() => explainAccess(graph, "u-ceo", "repo-web", { permission: "owner" as Permission }))).toBe(
      "INVALID_PERMISSION",
    );
  });
});

describe("explainAccess on awkward graphs", () => {
  const cyclic: GraphSnapshot = {
    principals: [{ id: "u-a", kind: "user" }],
    groups: [{ id: "g-1" }, { id: "g-2" }, { id: "g-3" }],
    memberships: [
      { member: "u-a", group: "g-1" },
      { member: "g-1", group: "g-2" },
      { member: "g-2", group: "g-1" },
      { member: "g-2", group: "g-3" },
    ],
    resources: [{ id: "r", kind: "repository" }],
    grants: [
      { subject: "g-3", resource: "r", permission: "write" },
      { subject: "g-1", resource: "r", permission: "read" },
    ],
  };

  it("does not loop on membership cycles", () => {
    const result = explainAccess(buildGraph(cyclic), "u-a", "r");
    expect(result.paths.map((p) => p.via)).toEqual([
      ["u-a", "g-1", "g-2", "g-3"],
      ["u-a", "g-1"],
    ]);
    expect(result.truncated).toBe(false);
  });

  // Diamond chain: every level doubles the number of paths to the top group.
  function diamonds(levels: number): GraphSnapshot {
    const groups = [{ id: "g-top" }];
    const memberships = [];
    let below = "u-a";
    for (let i = 0; i < levels; i++) {
      const join = i === levels - 1 ? "g-top" : `g-join-${i}`;
      if (join !== "g-top") groups.push({ id: join });
      for (const side of ["l", "r"]) {
        const id = `g-${side}-${i}`;
        groups.push({ id });
        memberships.push({ member: below, group: id }, { member: id, group: join });
      }
      below = join;
    }
    return {
      principals: [{ id: "u-a", kind: "user" }],
      groups,
      memberships,
      resources: [{ id: "r", kind: "repository" }],
      grants: [{ subject: "g-top", resource: "r", permission: "write" }],
    };
  }

  it("caps the listed paths and says so", () => {
    const result = explainAccess(buildGraph(diamonds(4)), "u-a", "r", { maxPaths: 3 });
    expect(result.totalPaths).toBe(16);
    expect(result.paths).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.outcome).toBe("GRANTED");
  });

  it("stops exploring after the step budget but still gives the exact outcome", () => {
    const result = explainAccess(buildGraph(diamonds(12)), "u-a", "r", { maxSteps: 200 });
    expect(result.truncated).toBe(true);
    expect(result.totalPaths).toBeLessThan(4096);
    expect(result).toMatchObject({ outcome: "GRANTED", effective: "write" });
  });

  it("marks paths cut off by the depth limit as truncated", () => {
    const result = explainAccess(buildGraph(diamonds(4)), "u-a", "r", { maxDepth: 3 });
    expect(result).toMatchObject({ outcome: "GRANTED", totalPaths: 0, truncated: true });
  });
});
