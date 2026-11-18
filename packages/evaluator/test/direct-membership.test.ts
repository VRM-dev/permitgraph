import { describe, expect, it } from "vitest";
import { buildGraph, checkDirectMembership, GraphError } from "../src/index.js";
import type { GraphSnapshot } from "../src/index.js";
import { tinyOrg, withoutEdge } from "./fixtures/tiny-org.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GraphError) return err.code;
    throw err;
  }
  return undefined;
}

describe("checkDirectMembership on the tiny-org fixture", () => {
  const graph = buildGraph(tinyOrg);

  it("reports a user listed directly in a group as MEMBER with the granting edge", () => {
    expect(checkDirectMembership(graph, "u-alice", "g-engineering")).toEqual({
      member: "u-alice",
      group: "g-engineering",
      outcome: "MEMBER",
      edge: { member: "u-alice", group: "g-engineering" },
    });
  });

  it("supports service principals and groups as direct members", () => {
    expect(checkDirectMembership(graph, "svc-ci", "g-automation").outcome).toBe("MEMBER");
    expect(checkDirectMembership(graph, "g-contractors", "g-engineering").outcome).toBe("MEMBER");
  });

  it("reports NOT_MEMBER without an edge when no membership edge exists", () => {
    const result = checkDirectMembership(graph, "u-bob", "g-engineering");
    expect(result).toEqual({ member: "u-bob", group: "g-engineering", outcome: "NOT_MEMBER" });
    expect(result).not.toHaveProperty("edge");
  });

  it("does not count membership inherited through a nested group", () => {
    expect(checkDirectMembership(graph, "u-contractor", "g-contractors").outcome).toBe("MEMBER");
    expect(checkDirectMembership(graph, "u-contractor", "g-engineering").outcome).toBe("NOT_MEMBER");
  });

  it("does not treat membership as symmetric", () => {
    expect(checkDirectMembership(graph, "g-engineering", "g-contractors").outcome).toBe("NOT_MEMBER");
  });
});

describe("missing membership edge", () => {
  it("flips MEMBER to NOT_MEMBER when the only edge is removed", () => {
    const before = buildGraph(tinyOrg);
    const after = buildGraph(withoutEdge(tinyOrg, "u-alice", "g-engineering"));

    expect(checkDirectMembership(before, "u-alice", "g-engineering").outcome).toBe("MEMBER");
    expect(checkDirectMembership(after, "u-alice", "g-engineering").outcome).toBe("NOT_MEMBER");
  });

  it("leaves the original fixture untouched", () => {
    withoutEdge(tinyOrg, "u-alice", "g-engineering");
    expect(tinyOrg.memberships).toHaveLength(4);
  });

  it("rejects a snapshot whose edge points to a group that is missing", () => {
    const broken: GraphSnapshot = {
      ...tinyOrg,
      memberships: [...tinyOrg.memberships, { member: "u-bob", group: "g-finance" }],
    };
    expect(codeOf(() => buildGraph(broken))).toBe("UNKNOWN_GROUP");
  });

  it("rejects a snapshot whose edge lists a member that is missing", () => {
    const broken: GraphSnapshot = {
      ...tinyOrg,
      memberships: [...tinyOrg.memberships, { member: "u-ghost", group: "g-engineering" }],
    };
    expect(codeOf(() => buildGraph(broken))).toBe("UNKNOWN_MEMBER");
  });
});

describe("query validation", () => {
  const graph = buildGraph(tinyOrg);

  it("throws UNKNOWN_MEMBER for an id that is not in the snapshot", () => {
    expect(codeOf(() => checkDirectMembership(graph, "u-nobody", "g-engineering"))).toBe("UNKNOWN_MEMBER");
  });

  it("throws UNKNOWN_MEMBER when a resource is used as the member", () => {
    expect(codeOf(() => checkDirectMembership(graph, "repo-api", "g-engineering"))).toBe("UNKNOWN_MEMBER");
  });

  it("throws UNKNOWN_GROUP when the target is missing or not a group", () => {
    expect(codeOf(() => checkDirectMembership(graph, "u-alice", "g-finance"))).toBe("UNKNOWN_GROUP");
    expect(codeOf(() => checkDirectMembership(graph, "u-alice", "u-bob"))).toBe("UNKNOWN_GROUP");
  });
});
