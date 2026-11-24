import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp, USER_HEADER } from "../src/app.js";
import { InMemorySnapshotStore } from "../src/memory-snapshot-store.js";
import { InMemoryWorkspaceStore } from "../src/memory-store.js";
import { seed } from "../src/seed.js";
import { SEED_USERS, SEED_WORKSPACES } from "../src/seed-data.js";
import { canonicalJson, snapshotHash } from "../src/snapshots.js";

const outsider = { id: "u-nina", email: "nina@example.test", displayName: "Nina Nobody" };

let workspaces: InMemoryWorkspaceStore;
let snapshots: InMemorySnapshotStore;
let app: FastifyInstance;
let acmeId: string;
let globexId: string;

beforeEach(async () => {
  workspaces = new InMemoryWorkspaceStore([...SEED_USERS, outsider]);
  snapshots = new InMemorySnapshotStore();
  await seed({ workspaces, snapshots });
  app = buildApp({ store: workspaces, snapshots });
  const [acme] = await workspaces.listWorkspacesForUser("u-olivia");
  const [globex] = await workspaces.listWorkspacesForUser("u-oscar");
  acmeId = acme!.id;
  globexId = globex!.id;
});

afterEach(async () => {
  await app.close();
});

const as = (userId: string) => ({ [USER_HEADER]: userId });

const smallGraph = {
  principals: [{ id: "p-sam", kind: "user", displayName: "Sam Example" }],
  groups: [{ id: "g-support" }],
  memberships: [{ member: "p-sam", group: "g-support" }],
  resources: [{ id: "repo-docs", kind: "repository" }],
};

function importAs(userId: string, workspaceId: string, payload: NonNullable<InjectOptions["payload"]>) {
  return app.inject({ method: "POST", url: `/workspaces/${workspaceId}/snapshots`, headers: as(userId), payload });
}

describe("synthetic seed", () => {
  it("creates both workspaces with roles and one snapshot each", async () => {
    expect((await workspaces.listWorkspacesForUser("u-eddie")).map((w) => [w.slug, w.role])).toEqual([["acme", "EDITOR"]]);
    expect((await workspaces.listWorkspacesForUser("u-vera")).map((w) => [w.slug, w.role])).toEqual([["acme", "VIEWER"]]);
    expect(await snapshots.listSnapshots(acmeId)).toHaveLength(1);
    expect(await snapshots.listSnapshots(globexId)).toHaveLength(1);
  });

  it("is idempotent", async () => {
    expect(await seed({ workspaces, snapshots })).toEqual({ workspacesCreated: 0, snapshotsImported: 0 });
    expect(await snapshots.listSnapshots(acmeId)).toHaveLength(1);
  });

  it("only contains example.test addresses", () => {
    for (const user of SEED_USERS) expect(user.email).toMatch(/@example\.test$/);
  });
});

describe("snapshot import", () => {
  it("lets an editor import and records counts, hash and importer", async () => {
    const res = await importAs("u-eddie", acmeId, { label: "support team", graph: smallGraph });
    expect(res.statusCode).toBe(201);
    const { snapshot } = res.json();
    expect(snapshot.counts).toEqual({ principals: 1, groups: 1, memberships: 1, resources: 1 });
    expect(snapshot.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.importedBy).toBe("u-eddie");

    const list = await app.inject({ method: "GET", url: `/workspaces/${acmeId}/snapshots`, headers: as("u-vera") });
    expect(list.json().snapshots.map((s: { label: string }) => s.label)).toEqual(["support team", "acme baseline"]);
  });

  it("forbids viewers and hides the workspace from outsiders", async () => {
    const viewer = await importAs("u-vera", acmeId, { label: "x", graph: smallGraph });
    expect(viewer.statusCode).toBe(403);
    const other = await importAs("u-nina", acmeId, { label: "x", graph: smallGraph });
    expect(other.statusCode).toBe(404);
  });

  it("rejects a dangling membership edge with 422 and stores nothing", async () => {
    const graph = { ...smallGraph, memberships: [{ member: "p-sam", group: "g-missing" }] };
    const res = await importAs("u-olivia", acmeId, { label: "broken", graph });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_SNAPSHOT");
    expect(res.json().error.message).toContain("UNKNOWN_GROUP");
    expect(await snapshots.listSnapshots(acmeId)).toHaveLength(1);
  });

  it("rejects duplicate ids across node kinds", async () => {
    const graph = { ...smallGraph, groups: [{ id: "p-sam" }], memberships: [] };
    const res = await importAs("u-olivia", acmeId, { label: "dup", graph });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain("DUPLICATE_ID");
  });

  it("rejects unknown fields and principal kinds with 400", async () => {
    const extra = await importAs("u-olivia", acmeId, { label: "x", graph: { ...smallGraph, grants: [] } });
    expect(extra.statusCode).toBe(400);
    const kind = await importAs("u-olivia", acmeId, {
      label: "x",
      graph: { ...smallGraph, principals: [{ id: "p-sam", kind: "robot" }] },
    });
    expect(kind.statusCode).toBe(400);
  });
});

describe("immutability and isolation", () => {
  it("returns the stored graph unchanged and offers no way to change it", async () => {
    const res = await importAs("u-olivia", acmeId, { label: "support team", graph: smallGraph });
    const id = res.json().snapshot.id as string;
    const url = `/workspaces/${acmeId}/snapshots/${id}`;

    const read = await app.inject({ method: "GET", url, headers: as("u-vera") });
    expect(read.statusCode).toBe(200);
    expect(read.json().snapshot.graph).toEqual(smallGraph);

    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const res2 = await app.inject({ method, url, headers: as("u-olivia"), payload: { label: "renamed" } });
      expect(res2.statusCode).toBe(404);
    }
  });

  it("is not affected by later changes to the caller's object", async () => {
    const [summary] = await snapshots.listSnapshots(acmeId);
    const first = await snapshots.findSnapshot(acmeId, summary!.id);
    (first!.graph.principals as unknown[]).length = 0;
    const again = await snapshots.findSnapshot(acmeId, summary!.id);
    expect(again!.graph.principals.length).toBeGreaterThan(0);
  });

  it("keeps the two seeded workspaces' graphs apart", async () => {
    const [globexSnapshot] = await snapshots.listSnapshots(globexId);

    // A globex snapshot id is not found under acme, even for acme's owner.
    const crossed = await app.inject({
      method: "GET",
      url: `/workspaces/${acmeId}/snapshots/${globexSnapshot!.id}`,
      headers: as("u-olivia"),
    });
    expect(crossed.statusCode).toBe(404);

    // Acme members can't list globex snapshots at all.
    const list = await app.inject({ method: "GET", url: `/workspaces/${globexId}/snapshots`, headers: as("u-eddie") });
    expect(list.statusCode).toBe(404);

    // Both define g-engineering, but each workspace sees only its own nodes.
    const acmeList = await app.inject({ method: "GET", url: `/workspaces/${acmeId}/snapshots`, headers: as("u-olivia") });
    const acmeSnap = await app.inject({
      method: "GET",
      url: `/workspaces/${acmeId}/snapshots/${acmeList.json().snapshots[0].id}`,
      headers: as("u-olivia"),
    });
    const principalIds = acmeSnap.json().snapshot.graph.principals.map((p: { id: string }) => p.id);
    expect(principalIds).toContain("p-dana");
    expect(principalIds).not.toContain("p-hana");
  });
});

describe("content hash", () => {
  it("ignores object key order but not array order", () => {
    const graph = SEED_WORKSPACES[0]!.snapshots[0]!.graph;
    const reordered = JSON.parse(
      canonicalJson(graph).replace(/"displayName":("[^"]*"),"id":("[^"]*")/g, '"id":$2,"displayName":$1'),
    );
    expect(snapshotHash(reordered)).toBe(snapshotHash(graph));

    const shuffled = { ...graph, memberships: [...graph.memberships].reverse() };
    expect(snapshotHash(shuffled)).not.toBe(snapshotHash(graph));
  });

  it("sorts keys in canonical JSON", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
});
