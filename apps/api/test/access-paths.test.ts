import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildGraph, normalizeSnapshot } from "@permitgraph/evaluator";
import { sampleOrg } from "../../../packages/evaluator/test/fixtures/sample-org.js";
import { accessPaths, accessQuerySchema } from "../src/access-paths.js";
import { buildApp, USER_HEADER } from "../src/app.js";
import { NormalizedGraphCache } from "../src/graph-search.js";
import { InMemorySnapshotStore } from "../src/memory-snapshot-store.js";
import { InMemoryWorkspaceStore } from "../src/memory-store.js";
import { seed } from "../src/seed.js";
import { SEED_USERS } from "../src/seed-data.js";

describe("accessPaths", () => {
  const normalized = normalizeSnapshot(sampleOrg);
  const access = buildGraph(sampleOrg);
  const query = (q: Record<string, unknown>) => accessQuerySchema.parse(q);

  it("turns evaluator paths into node ids and normalized edges", () => {
    const result = accessPaths(normalized, access, query({ subject: "u-contractor-02", resource: "repo-web" }));
    expect(result).toMatchObject({ outcome: "GRANTED", effective: "write", totalPaths: 2, truncated: false });
    expect(result.paths[0]).toEqual({
      permission: "write",
      nodes: ["u-contractor-02", "g-contractors", "repo-web"],
      edges: [
        { id: "member_of:u-contractor-02->g-contractors", kind: "member_of", from: "u-contractor-02", to: "g-contractors" },
        { id: "grant:write:g-contractors->repo-web", kind: "grant", from: "g-contractors", to: "repo-web", permission: "write" },
      ],
    });
    const edgeIds = new Set(normalized.edges.map((e) => e.id));
    expect(result.paths.flatMap((p) => p.edges).every((e) => edgeIds.has(e.id))).toBe(true);
    expect(result.nodes.map((n) => n.id)).toEqual(["u-contractor-02", "g-contractors", "g-engineering", "repo-web"]);
    expect(result.subject.label).toBe(normalized.nodes.find((n) => n.id === "u-contractor-02")!.label);
  });

  it("keeps the subject and resource labels when there is no path", () => {
    const result = accessPaths(normalized, access, query({ subject: "u-contractor-02", resource: "repo-ledger" }));
    expect(result).toMatchObject({ outcome: "NOT_GRANTED", effective: null, paths: [], nodes: [result.subject, result.resource] });
  });

  it("validates the query", () => {
    expect(() => query({ subject: "a" })).toThrow();
    expect(() => query({ subject: "a", resource: "b", permission: "owner" })).toThrow();
    expect(() => query({ subject: "a", resource: "b", limit: "51" })).toThrow();
    expect(() => query({ subject: "a", resource: "b", depth: "3" })).toThrow();
    expect(query({ subject: " a ", resource: "b" })).toEqual({ subject: "a", resource: "b", limit: 20 });
  });
});

describe("NormalizedGraphCache.accessGraph", () => {
  it("builds the indexed graph once per snapshot", () => {
    const cache = new NormalizedGraphCache(2);
    const a = cache.accessGraph("a", sampleOrg);
    expect(cache.accessGraph("a", sampleOrg)).toBe(a);
    expect(cache.size).toBe(1);
    expect(a.groupsOf.get("g-contractors")).toEqual(["g-engineering"]);
  });
});

describe("access route", () => {
  let app: FastifyInstance;
  let acmeId: string;
  let acmeSnapshot: string;
  let globexId: string;

  beforeEach(async () => {
    const workspaces = new InMemoryWorkspaceStore(SEED_USERS);
    const snapshots = new InMemorySnapshotStore();
    await seed({ workspaces, snapshots });
    app = buildApp({ store: workspaces, snapshots });
    acmeId = (await workspaces.listWorkspacesForUser("u-olivia"))[0]!.id;
    globexId = (await workspaces.listWorkspacesForUser("u-oscar"))[0]!.id;
    acmeSnapshot = (await snapshots.listSnapshots(acmeId))[0]!.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (userId: string, url: string) => app.inject({ method: "GET", url, headers: { [USER_HEADER]: userId } });
  const url = (query: string, ws = acmeId, sid = acmeSnapshot) => `/workspaces/${ws}/snapshots/${sid}/access?${query}`;

  it("lets a viewer trace a contractor's inherited write access", async () => {
    const res = await get("u-vera", url("subject=p-contractor&resource=repo-infra&permission=write"));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      snapshotId: acmeSnapshot,
      subject: { id: "p-contractor", label: "Casey Contractor" },
      resource: { id: "repo-infra", label: "acme/infra" },
      permission: "write",
      effective: "write",
      outcome: "GRANTED",
      totalPaths: 1,
      truncated: false,
    });
    expect(body.paths[0].nodes).toEqual(["p-contractor", "g-contractors", "g-platform", "repo-infra"]);
    expect(body.paths[0].edges.map((e: { id: string }) => e.id)).toEqual([
      "member_of:p-contractor->g-contractors",
      "member_of:g-contractors->g-platform",
      "grant:write:g-platform->repo-infra",
    ]);
  });

  it("answers NOT_GRANTED when the permission is not reached", async () => {
    const res = await get("u-vera", url("subject=p-lee&resource=repo-infra"));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: "NOT_GRANTED", effective: null, paths: [] });
  });

  it("returns 404 with a code for ids that are not in the snapshot", async () => {
    const subject = await get("u-vera", url("subject=p-nobody&resource=repo-infra"));
    expect(subject.statusCode).toBe(404);
    expect(subject.json().error.code).toBe("UNKNOWN_SUBJECT");
    const resource = await get("u-vera", url("subject=p-lee&resource=g-platform"));
    expect(resource.statusCode).toBe(404);
    expect(resource.json().error.code).toBe("UNKNOWN_RESOURCE");
  });

  it("returns 400 for missing or invalid parameters", async () => {
    for (const query of ["subject=p-lee", "subject=p-lee&resource=repo-api&permission=owner", "subject=p-lee&resource=repo-api&limit=0"]) {
      const res = await get("u-vera", url(query));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("BAD_REQUEST");
    }
  });

  it("keeps snapshots inside their workspace", async () => {
    const outsider = await get("u-oscar", url("subject=p-lee&resource=repo-api"));
    expect(outsider.statusCode).toBe(404);
    const crossWorkspace = await get("u-oscar", url("subject=p-lee&resource=repo-api", globexId));
    expect(crossWorkspace.statusCode).toBe(404);
    expect(crossWorkspace.json().error.code).toBe("NOT_FOUND");
  });

  it("requires an identity", async () => {
    const res = await app.inject({ method: "GET", url: url("subject=p-lee&resource=repo-api") });
    expect(res.statusCode).toBe(401);
  });
});
