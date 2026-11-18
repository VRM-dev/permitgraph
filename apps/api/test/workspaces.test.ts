import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, USER_HEADER } from "../src/app.js";
import type { User } from "../src/domain.js";
import { InMemorySnapshotStore } from "../src/memory-snapshot-store.js";
import { InMemoryWorkspaceStore } from "../src/memory-store.js";
import { can } from "../src/roles.js";

// Synthetic users only.
const users: User[] = [
  { id: "u-olivia", email: "olivia@example.test", displayName: "Olivia Owner" },
  { id: "u-eddie", email: "eddie@example.test", displayName: "Eddie Editor" },
  { id: "u-vera", email: "vera@example.test", displayName: "Vera Viewer" },
  { id: "u-oscar", email: "oscar@example.test", displayName: "Oscar Outsider" },
];

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp({ store: new InMemoryWorkspaceStore(users), snapshots: new InMemorySnapshotStore() });
});

afterEach(async () => {
  await app.close();
});

const as = (userId: string) => ({ [USER_HEADER]: userId });

async function createWorkspace(userId: string, slug: string, name = "Acme") {
  const res = await app.inject({ method: "POST", url: "/workspaces", headers: as(userId), payload: { slug, name } });
  expect(res.statusCode).toBe(201);
  return res.json().workspace as { id: string; slug: string; role: string };
}

async function setRole(actor: string, workspaceId: string, userId: string, role: string) {
  return app.inject({
    method: "PUT",
    url: `/workspaces/${workspaceId}/members/${userId}`,
    headers: as(actor),
    payload: { role },
  });
}

describe("role permissions", () => {
  it("grants actions by role", () => {
    expect(can("OWNER", "members:manage")).toBe(true);
    expect(can("EDITOR", "members:manage")).toBe(false);
    expect(can("EDITOR", "snapshot:import")).toBe(true);
    expect(can("VIEWER", "snapshot:import")).toBe(false);
    expect(can("VIEWER", "workspace:read")).toBe(true);
  });
});

describe("health", () => {
  it("responds without authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("authentication", () => {
  it("rejects requests without the user header", async () => {
    const res = await app.inject({ method: "GET", url: "/workspaces" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects unknown users", async () => {
    const res = await app.inject({ method: "GET", url: "/workspaces", headers: as("u-nobody") });
    expect(res.statusCode).toBe(401);
  });
});

describe("workspaces", () => {
  it("makes the creator the owner and lists only their workspaces", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    expect(acme.role).toBe("OWNER");
    await createWorkspace("u-oscar", "globex", "Globex");

    const mine = await app.inject({ method: "GET", url: "/workspaces", headers: as("u-olivia") });
    expect(mine.json().workspaces.map((w: { slug: string }) => w.slug)).toEqual(["acme"]);
  });

  it("validates the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/workspaces",
      headers: as("u-olivia"),
      payload: { slug: "Not A Slug", name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("rejects a duplicate slug", async () => {
    await createWorkspace("u-olivia", "acme");
    const res = await app.inject({
      method: "POST",
      url: "/workspaces",
      headers: as("u-oscar"),
      payload: { slug: "acme", name: "Other" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SLUG_TAKEN");
  });

  it("hides a workspace from non-members with 404", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    for (const url of [`/workspaces/${acme.id}`, `/workspaces/${acme.id}/members`]) {
      const res = await app.inject({ method: "GET", url, headers: as("u-oscar") });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("members", () => {
  it("lets the owner add members with roles", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    expect((await setRole("u-olivia", acme.id, "u-eddie", "EDITOR")).statusCode).toBe(200);
    expect((await setRole("u-olivia", acme.id, "u-vera", "VIEWER")).statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: `/workspaces/${acme.id}/members`, headers: as("u-vera") });
    expect(res.statusCode).toBe(200);
    expect(res.json().members.map((m: { userId: string; role: string }) => [m.userId, m.role])).toEqual([
      ["u-eddie", "EDITOR"],
      ["u-olivia", "OWNER"],
      ["u-vera", "VIEWER"],
    ]);

    const seen = await app.inject({ method: "GET", url: `/workspaces/${acme.id}`, headers: as("u-vera") });
    expect(seen.json().workspace.role).toBe("VIEWER");
  });

  it("forbids editors and viewers from managing members", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    await setRole("u-olivia", acme.id, "u-eddie", "EDITOR");
    await setRole("u-olivia", acme.id, "u-vera", "VIEWER");

    for (const actor of ["u-eddie", "u-vera"]) {
      const res = await setRole(actor, acme.id, "u-oscar", "VIEWER");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    }
  });

  it("does not let outsiders add themselves", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    const res = await setRole("u-oscar", acme.id, "u-oscar", "OWNER");
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an unknown target user", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    const res = await setRole("u-olivia", acme.id, "u-ghost", "VIEWER");
    expect(res.statusCode).toBe(404);
  });

  it("rejects an unknown role", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    const res = await setRole("u-olivia", acme.id, "u-eddie", "ADMIN");
    expect(res.statusCode).toBe(400);
  });

  it("keeps at least one owner", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    const demote = await setRole("u-olivia", acme.id, "u-olivia", "EDITOR");
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error.code).toBe("LAST_OWNER");

    await setRole("u-olivia", acme.id, "u-eddie", "OWNER");
    expect((await setRole("u-olivia", acme.id, "u-olivia", "EDITOR")).statusCode).toBe(200);
  });

  it("keeps memberships separate between workspaces", async () => {
    const acme = await createWorkspace("u-olivia", "acme");
    const globex = await createWorkspace("u-oscar", "globex", "Globex");
    await setRole("u-olivia", acme.id, "u-eddie", "EDITOR");

    const res = await app.inject({ method: "GET", url: `/workspaces/${globex.id}`, headers: as("u-eddie") });
    expect(res.statusCode).toBe(404);
    const members = await app.inject({ method: "GET", url: `/workspaces/${globex.id}/members`, headers: as("u-oscar") });
    expect(members.json().members.map((m: { userId: string }) => m.userId)).toEqual(["u-oscar"]);
  });
});
