import { describe, expect, it } from "vitest";
import { buildGraph, GraphError, normalizeSnapshot, toSnapshot } from "../src/index.js";
import type { GraphSnapshot } from "../src/index.js";
import { reorder, sampleOrg } from "./fixtures/sample-org.js";
import { tinyOrg } from "./fixtures/tiny-org.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GraphError) return err.code;
    throw err;
  }
  return undefined;
}

function shuffled(snapshot: GraphSnapshot, seed: number): GraphSnapshot {
  return {
    principals: reorder(snapshot.principals, seed),
    groups: reorder(snapshot.groups, seed + 1),
    memberships: reorder(snapshot.memberships, seed + 2),
    resources: reorder(snapshot.resources, seed + 3),
    grants: reorder(snapshot.grants ?? [], seed + 4),
  };
}

describe("normalizeSnapshot on the 40-identity sample", () => {
  const normalized = normalizeSnapshot(sampleOrg);

  it("loads 40 identities with the expected counts", () => {
    const identities = normalized.nodes.filter((n) => n.kind === "principal");
    expect(identities).toHaveLength(40);
    expect(identities.filter((n) => n.type === "user")).toHaveLength(34);
    expect(identities.filter((n) => n.type === "service")).toHaveLength(6);
    expect(normalized.counts).toEqual({ principals: 40, groups: 9, resources: 6, memberships: 48, grants: 17 });
    expect(normalized.nodes).toHaveLength(55);
    expect(normalized.edges).toHaveLength(65);
  });

  it("produces the same result for every input order", () => {
    for (const seed of [1, 7, 42, 2026]) {
      expect(normalizeSnapshot(shuffled(sampleOrg, seed))).toEqual(normalized);
    }
  });

  it("round-trips through toSnapshot without changing", () => {
    const again = normalizeSnapshot(toSnapshot(normalized));
    expect(again).toEqual(normalized);
  });

  it("orders nodes principals, groups, resources and by id inside each kind", () => {
    const kinds = normalized.nodes.map((n) => n.kind);
    expect(kinds.indexOf("group")).toBe(40);
    expect(kinds.indexOf("resource")).toBe(49);
    const ids = normalized.nodes.filter((n) => n.kind === "group").map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("gives every edge a unique, stable id", () => {
    const ids = normalized.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("member_of:g-contractors->g-engineering");
    expect(ids).toContain("grant:write:g-contractors->repo-web");
  });

  it("keeps nested membership and grant edges separate", () => {
    const contractorEdges = normalized.edges.filter((e) => e.from === "u-contractor-01");
    expect(contractorEdges).toEqual([
      { id: "member_of:u-contractor-01->g-contractors", kind: "member_of", from: "u-contractor-01", to: "g-contractors" },
      {
        id: "grant:write:u-contractor-01->repo-docs",
        kind: "grant",
        from: "u-contractor-01",
        to: "repo-docs",
        permission: "write",
      },
    ]);
  });
});

describe("normalizeSnapshot details", () => {
  it("removes duplicate membership and grant edges", () => {
    const withDuplicates: GraphSnapshot = {
      ...sampleOrg,
      memberships: [...sampleOrg.memberships, { member: "u-ceo", group: "g-all-staff" }],
      grants: [...(sampleOrg.grants ?? []), { subject: "u-ceo", resource: "repo-ledger", permission: "read" }],
    };
    expect(normalizeSnapshot(withDuplicates)).toEqual(normalizeSnapshot(sampleOrg));
  });

  it("keeps different permissions on the same pair as separate edges, weakest first", () => {
    const snapshot: GraphSnapshot = {
      ...tinyOrg,
      grants: [
        { subject: "u-alice", resource: "repo-api", permission: "admin" },
        { subject: "u-alice", resource: "repo-api", permission: "read" },
      ],
    };
    const grants = normalizeSnapshot(snapshot).edges.filter((e) => e.kind === "grant");
    expect(grants.map((e) => e.id)).toEqual(["grant:read:u-alice->repo-api", "grant:admin:u-alice->repo-api"]);
  });

  it("labels nodes with their display name, falling back to the id", () => {
    const snapshot: GraphSnapshot = {
      ...tinyOrg,
      principals: [
        { id: "u-named", kind: "user", displayName: "  Named Person  " },
        { id: "u-blank", kind: "user", displayName: "   " },
        { id: "u-plain", kind: "user" },
      ],
      memberships: [],
    };
    const labels = Object.fromEntries(
      normalizeSnapshot(snapshot)
        .nodes.filter((n) => n.kind === "principal")
        .map((n) => [n.id, n.label]),
    );
    expect(labels).toEqual({ "u-blank": "u-blank", "u-named": "Named Person", "u-plain": "u-plain" });
  });

  it("accepts snapshots without a grants array", () => {
    const n = normalizeSnapshot(tinyOrg);
    expect(n.counts).toEqual({ principals: 4, groups: 3, resources: 2, memberships: 4, grants: 0 });
    expect(n.edges.every((e) => e.kind === "member_of")).toBe(true);
  });

  it("does not modify its input", () => {
    const before = JSON.stringify(sampleOrg);
    normalizeSnapshot(sampleOrg);
    expect(JSON.stringify(sampleOrg)).toBe(before);
  });
});

describe("grant validation", () => {
  const base: GraphSnapshot = { ...tinyOrg, grants: [] };

  it("indexes grants by resource and by subject", () => {
    const graph = buildGraph(sampleOrg);
    expect(graph.grantsOn.get("repo-web")?.map((g) => g.subject)).toEqual(["g-engineering", "g-frontend", "g-contractors"]);
    expect(graph.grantsHeldBy.get("u-contractor-01")).toEqual([
      { subject: "u-contractor-01", resource: "repo-docs", permission: "write" },
    ]);
  });

  it("rejects a grant from an unknown subject", () => {
    const broken = { ...base, grants: [{ subject: "u-ghost", resource: "repo-api", permission: "read" as const }] };
    expect(codeOf(() => normalizeSnapshot(broken))).toBe("UNKNOWN_SUBJECT");
  });

  it("rejects a grant whose subject is a resource", () => {
    const broken = { ...base, grants: [{ subject: "repo-web", resource: "repo-api", permission: "read" as const }] };
    expect(codeOf(() => normalizeSnapshot(broken))).toBe("UNKNOWN_SUBJECT");
  });

  it("rejects a grant on something that is not a resource", () => {
    const broken = { ...base, grants: [{ subject: "u-alice", resource: "g-engineering", permission: "read" as const }] };
    expect(codeOf(() => normalizeSnapshot(broken))).toBe("UNKNOWN_RESOURCE");
  });

  it("rejects an unsupported permission", () => {
    const broken = {
      ...base,
      grants: [{ subject: "u-alice", resource: "repo-api", permission: "owner" }],
    } as unknown as GraphSnapshot;
    expect(codeOf(() => normalizeSnapshot(broken))).toBe("INVALID_PERMISSION");
  });
});
