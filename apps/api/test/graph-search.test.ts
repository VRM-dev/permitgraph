import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { normalizeSnapshot } from "@permitgraph/evaluator";
import { sampleOrg } from "../../../packages/evaluator/test/fixtures/sample-org.js";
import { buildApp, USER_HEADER } from "../src/app.js";
import { NormalizedGraphCache, searchNodes, searchQuerySchema } from "../src/graph-search.js";
import { InMemorySnapshotStore } from "../src/memory-snapshot-store.js";
import { InMemoryWorkspaceStore } from "../src/memory-store.js";
import { prepareSnapshot } from "../src/snapshots.js";
import { seed } from "../src/seed.js";
import { SEED_USERS } from "../src/seed-data.js";

const sample = normalizeSnapshot(sampleOrg);
const query = (q: Record<string, unknown>) => searchQuerySchema.parse(q);

describe("searchNodes", () => {
  it("ranks exact, then prefix, then substring matches", () => {
    const result = searchNodes(sample, query({ q: "platform" }));
    expect(result.nodes[0]).toMatchObject({ id: "g-platform", match: "exact" });
    const ranks = result.nodes.map((n) => n.match);
    expect(ranks).toEqual([...ranks].sort((a, b) => ["exact", "prefix", "contains"].indexOf(a!) - ["exact", "prefix", "contains"].indexOf(b!)));
    expect(result.nodes.filter((n) => n.id.startsWith("u-platform-"))).toHaveLength(8);
    expect(result.nodes.filter((n) => n.id.startsWith("u-platform-")).every((n) => n.match === "prefix")).toBe(true);
  });

  it("matches labels and ids case-insensitively", () => {
    expect(searchNodes(sample, query({ q: "MORGAN" })).nodes.map((n) => n.id)).toEqual(["u-ceo"]);
    expect(searchNodes(sample, query({ q: "U-CEO" })).nodes[0]).toMatchObject({ id: "u-ceo", match: "exact" });
  });

  it("filters by kind and type", () => {
    const services = searchNodes(sample, query({ type: "service" }));
    expect(services.total).toBe(6);
    expect(services.nodes.every((n) => n.kind === "principal" && n.type === "service")).toBe(true);
    expect(services.nodes[0]!.match).toBeUndefined();

    expect(searchNodes(sample, query({ kind: "group" })).total).toBe(9);
    expect(searchNodes(sample, query({ kind: "resource", type: "Repository" })).total).toBe(
      sample.nodes.filter((n) => n.kind === "resource" && n.type === "repository").length,
    );
    expect(searchNodes(sample, query({ q: "platform", kind: "principal" })).nodes.some((n) => n.kind !== "principal")).toBe(false);
  });

  it("pages through a stable order", () => {
    const all = searchNodes(sample, query({ limit: 100 }));
    expect(all.total).toBe(55);
    const pages = [0, 20, 40].flatMap((offset) => searchNodes(sample, query({ limit: 20, offset })).nodes);
    expect(pages.map((n) => n.id)).toEqual(all.nodes.map((n) => n.id));
    expect(searchNodes(sample, query({ offset: 500 })).nodes).toEqual([]);
  });

  it("returns nothing for an unmatched query", () => {
    expect(searchNodes(sample, query({ q: "no-such-node" }))).toMatchObject({ total: 0, nodes: [] });
  });

  it("rejects bad paging and unknown parameters", () => {
    expect(() => query({ limit: "0" })).toThrow();
    expect(() => query({ limit: "101" })).toThrow();
    expect(() => query({ offset: "-1" })).toThrow();
    expect(() => query({ kind: "edge" })).toThrow();
    expect(() => query({ sort: "id" })).toThrow();
  });
});

describe("NormalizedGraphCache", () => {
  it("reuses entries and drops the least recently used one", () => {
    const cache = new NormalizedGraphCache(2);
    const a = cache.get("a", sampleOrg);
    expect(cache.get("a", sampleOrg)).toBe(a);
    cache.get("b", sampleOrg);
    cache.get("a", sampleOrg);
    cache.get("c", sampleOrg);
    expect(cache.size).toBe(2);
    expect(cache.get("a", sampleOrg)).toBe(a);
  });
});

describe("graph search routes", () => {
  let app: FastifyInstance;
  let snapshots: InMemorySnapshotStore;
  let acmeId: string;
  let globexId: string;
  let sampleId: string;

  beforeEach(async () => {
    const workspaces = new InMemoryWorkspaceStore(SEED_USERS);
    snapshots = new InMemorySnapshotStore();
    await seed({ workspaces, snapshots });
    app = buildApp({ store: workspaces, snapshots });
    acmeId = (await workspaces.listWorkspacesForUser("u-olivia"))[0]!.id;
    globexId = (await workspaces.listWorkspacesForUser("u-oscar"))[0]!.id;
    const created = await snapshots.createSnapshot({
      ...prepareSnapshot(sampleOrg),
      workspaceId: acmeId,
      label: "sample org",
      importedBy: "u-olivia",
    });
    sampleId = created.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (userId: string, url: string) => app.inject({ method: "GET", url, headers: { [USER_HEADER]: userId } });

  it("lets a viewer search a snapshot", async () => {
    const res = await get("u-vera", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes?q=platform&kind=group`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      snapshotId: sampleId,
      total: 1,
      limit: 25,
      offset: 0,
      nodes: [{ id: "g-platform", kind: "group", type: "group", label: "Platform", match: "exact" }],
    });
  });

  it("pages with limit and offset", async () => {
    const res = await get("u-vera", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes?type=user&limit=10&offset=30`);
    expect(res.json()).toMatchObject({ total: 34, limit: 10, offset: 30 });
    expect(res.json().nodes).toHaveLength(4);
  });

  it("returns 400 for invalid query parameters", async () => {
    const res = await get("u-vera", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes?limit=1000`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("returns a node with its edges", async () => {
    const res = await get("u-vera", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes/g-contractors`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.node).toEqual({ id: "g-contractors", kind: "group", type: "group", label: "Contractors" });
    expect(body.outgoing).toContainEqual({
      id: "member_of:g-contractors->g-engineering",
      kind: "member_of",
      from: "g-contractors",
      to: "g-engineering",
    });
    expect(body.outgoing).toContainEqual(
      expect.objectContaining({ kind: "grant", from: "g-contractors", to: "repo-web", permission: "write" }),
    );
    expect(body.incoming).toHaveLength(5);
    expect(body.incoming.every((e: { kind: string; to: string }) => e.kind === "member_of" && e.to === "g-contractors")).toBe(true);
  });

  it("returns 404 for an unknown node", async () => {
    const res = await get("u-vera", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes/u-nobody`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/Node not found/);
  });

  it("keeps snapshots scoped to their workspace", async () => {
    expect((await get("u-oscar", `/workspaces/${acmeId}/snapshots/${sampleId}/nodes`)).statusCode).toBe(404);
    expect((await get("u-oscar", `/workspaces/${globexId}/snapshots/${sampleId}/nodes`)).statusCode).toBe(404);
    expect((await get("u-oscar", `/workspaces/${globexId}/snapshots/${sampleId}/nodes/g-platform`)).statusCode).toBe(404);
  });

  it("requires a known user", async () => {
    const res = await app.inject({ method: "GET", url: `/workspaces/${acmeId}/snapshots/${sampleId}/nodes` });
    expect(res.statusCode).toBe(401);
  });
});
