import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { GraphSnapshot } from "@permitgraph/evaluator";
import { reorder, sampleOrg } from "../../../packages/evaluator/test/fixtures/sample-org.js";
import { buildApp, USER_HEADER } from "../src/app.js";
import { InMemorySnapshotStore } from "../src/memory-snapshot-store.js";
import { InMemoryWorkspaceStore } from "../src/memory-store.js";
import { seed } from "../src/seed.js";
import { SEED_USERS } from "../src/seed-data.js";

const outsider = { id: "u-nina", email: "nina@example.test", displayName: "Nina Nobody" };

let snapshots: InMemorySnapshotStore;
let app: FastifyInstance;
let acmeId: string;
let globexId: string;

beforeEach(async () => {
  const workspaces = new InMemoryWorkspaceStore([...SEED_USERS, outsider]);
  snapshots = new InMemorySnapshotStore();
  await seed({ workspaces, snapshots });
  app = buildApp({ store: workspaces, snapshots });
  acmeId = (await workspaces.listWorkspacesForUser("u-olivia"))[0]!.id;
  globexId = (await workspaces.listWorkspacesForUser("u-oscar"))[0]!.id;
});

afterEach(async () => {
  await app.close();
});

const as = (userId: string) => ({ [USER_HEADER]: userId });

function post(url: string, userId: string, payload: NonNullable<InjectOptions["payload"]>) {
  return app.inject({ method: "POST", url, headers: as(userId), payload });
}

const validate = (userId: string, workspaceId: string, graph: unknown) =>
  post(`/workspaces/${workspaceId}/imports/validate`, userId, { graph } as NonNullable<InjectOptions["payload"]>);

const importGraph = (userId: string, workspaceId: string, label: string, graph: unknown) =>
  post(`/workspaces/${workspaceId}/snapshots`, userId, { label, graph } as NonNullable<InjectOptions["payload"]>);

function shuffled(graph: GraphSnapshot, seedValue: number): GraphSnapshot {
  return {
    principals: reorder(graph.principals, seedValue),
    groups: reorder(graph.groups, seedValue + 1),
    memberships: reorder(graph.memberships, seedValue + 2),
    resources: reorder(graph.resources, seedValue + 3),
    grants: reorder(graph.grants ?? [], seedValue + 4),
  };
}

const sampleCounts = { principals: 40, groups: 9, memberships: 48, resources: 6, grants: 17 };

describe("40-identity sample import", () => {
  it("loads with the expected counts", async () => {
    const res = await importGraph("u-eddie", acmeId, "sample org", sampleOrg);
    expect(res.statusCode).toBe(201);
    expect(res.json().snapshot.counts).toEqual(sampleCounts);
  });

  it("gets the same hash and stored graph whatever the input order", async () => {
    const first = await importGraph("u-olivia", acmeId, "sample a", sampleOrg);
    const second = await importGraph("u-olivia", acmeId, "sample b", shuffled(sampleOrg, 7));
    const a = first.json().snapshot;
    const b = second.json().snapshot;
    expect(b.contentHash).toBe(a.contentHash);

    const read = async (id: string) =>
      (await app.inject({ method: "GET", url: `/workspaces/${acmeId}/snapshots/${id}`, headers: as("u-vera") })).json()
        .snapshot.graph;
    expect(await read(b.id)).toEqual(await read(a.id));
  });

  it("drops duplicate edges before storing", async () => {
    const graph = {
      ...sampleOrg,
      memberships: [...sampleOrg.memberships, sampleOrg.memberships[0]],
      grants: [...(sampleOrg.grants ?? []), sampleOrg.grants![0]],
    };
    const res = await importGraph("u-olivia", acmeId, "with duplicates", graph);
    expect(res.statusCode).toBe(201);
    expect(res.json().snapshot.counts).toEqual(sampleCounts);
  });
});

describe("POST /workspaces/:id/imports/validate", () => {
  it("reports counts and the hash an import would store, without storing", async () => {
    const res = await validate("u-eddie", acmeId, shuffled(sampleOrg, 3));
    expect(res.statusCode).toBe(200);
    const { report } = res.json();
    expect(report).toMatchObject({ valid: true, errorCount: 0, warningCount: 0, issues: [], counts: sampleCounts });

    const imported = await importGraph("u-eddie", acmeId, "sample", sampleOrg);
    expect(imported.json().snapshot.contentHash).toBe(report.contentHash);
    expect(await snapshots.listSnapshots(acmeId)).toHaveLength(2); // seed + the import, not the dry run
  });

  it("lists every problem with its path and leaves out counts and hash", async () => {
    const graph = {
      ...sampleOrg,
      memberships: [...sampleOrg.memberships, { member: "u-ghost", group: "g-platform" }],
      grants: [
        ...(sampleOrg.grants ?? []),
        { subject: "g-platform", resource: "repo-missing", permission: "write" },
        { subject: "g-platform", resource: "repo-web", permission: "owner" },
      ],
    };
    const res = await validate("u-olivia", acmeId, graph);
    expect(res.statusCode).toBe(200);
    const { report } = res.json();
    expect(report.valid).toBe(false);
    expect(report.issues.map((i: { code: string; path: string }) => [i.code, i.path])).toEqual([
      ["UNKNOWN_MEMBER", "memberships[48].member"],
      ["UNKNOWN_RESOURCE", "grants[17].resource"],
      ["INVALID_PERMISSION", "grants[18].permission"],
    ]);
    expect(report.counts).toBeUndefined();
    expect(report.contentHash).toBeUndefined();
  });

  it("reports duplicate edges as warnings", async () => {
    const graph = { ...sampleOrg, memberships: [...sampleOrg.memberships, sampleOrg.memberships[5]] };
    const { report } = (await validate("u-olivia", acmeId, graph)).json();
    expect(report.valid).toBe(true);
    expect(report.warningCount).toBe(1);
    expect(report.issues[0]).toMatchObject({ severity: "warning", code: "DUPLICATE_MEMBERSHIP", path: "memberships[48]" });
  });

  it("needs the import permission and hides other workspaces", async () => {
    expect((await validate("u-vera", acmeId, sampleOrg)).statusCode).toBe(403);
    expect((await validate("u-nina", acmeId, sampleOrg)).statusCode).toBe(404);
    expect((await validate("u-olivia", globexId, sampleOrg)).statusCode).toBe(404);
  });

  it("rejects malformed shapes with 400", async () => {
    expect((await validate("u-olivia", acmeId, { ...sampleOrg, grants: [{ subject: "x" }] })).statusCode).toBe(400);
    const extra = await post(`/workspaces/${acmeId}/imports/validate`, "u-olivia", { graph: sampleOrg, label: "x" });
    expect(extra.statusCode).toBe(400);
  });
});

describe("rejected imports", () => {
  it("return the full issue list with 422 and store nothing", async () => {
    const graph = {
      ...sampleOrg,
      groups: [...sampleOrg.groups, { id: "u-platform-01" }],
      grants: [{ subject: "g-nowhere", resource: "repo-web", permission: "read" }],
    };
    const res = await importGraph("u-olivia", acmeId, "broken", graph);
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.code).toBe("INVALID_SNAPSHOT");
    expect(error.errorCount).toBe(2);
    expect(error.issues.map((i: { code: string }) => i.code)).toEqual(["DUPLICATE_ID", "UNKNOWN_SUBJECT"]);
    expect(error.message).toContain("DUPLICATE_ID at groups[9].id");
    expect(await snapshots.listSnapshots(acmeId)).toHaveLength(1);
  });

  it("caps the listed issues but keeps the totals", async () => {
    const memberships = Array.from({ length: 150 }, (_, i) => ({ member: `u-ghost-${i}`, group: "g-platform" }));
    const res = await importGraph("u-olivia", acmeId, "many errors", { ...sampleOrg, memberships });
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.errorCount).toBe(150);
    expect(error.issues).toHaveLength(100);
    expect(error.truncated).toBe(true);
  });
});
