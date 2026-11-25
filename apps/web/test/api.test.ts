import { describe, expect, it } from "vitest";
import { ApiError, DEFAULT_API_URL, DEFAULT_USER, apiConfig, createApiClient } from "../src/lib/api";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  };
  return { impl, calls };
}

const config = { baseUrl: "http://api.test", userId: "u-vera" };

describe("apiConfig", () => {
  it("uses local defaults", () => {
    expect(apiConfig({})).toEqual({ baseUrl: DEFAULT_API_URL, userId: DEFAULT_USER });
  });

  it("reads the environment and strips trailing slashes", () => {
    expect(apiConfig({ PERMITGRAPH_API_URL: "http://api:3001//", PERMITGRAPH_USER: " u-olivia " })).toEqual({
      baseUrl: "http://api:3001",
      userId: "u-olivia",
    });
  });
});

describe("createApiClient", () => {
  it("sends the dev identity and never caches", async () => {
    const { impl, calls } = fakeFetch(200, { workspaces: [{ id: "w1", slug: "acme", name: "Acme", createdAt: "x" }] });
    const workspaces = await createApiClient(config, impl).listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://api.test/workspaces");
    expect(calls[0]?.init?.headers).toMatchObject({ "x-permitgraph-user": "u-vera" });
    expect(calls[0]?.init?.cache).toBe("no-store");
  });

  it("encodes path segments and skips empty query values", async () => {
    const { impl, calls } = fakeFetch(200, { snapshotId: "s/1", nodes: [], total: 0, limit: 25, offset: 0 });
    await createApiClient(config, impl).searchNodes("w 1", "s/1", { q: "a&b", limit: 25, offset: 0 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/workspaces/w%201/snapshots/s%2F1/nodes");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "a&b", limit: "25", offset: "0" });

    await createApiClient(config, impl).getNode("w1", "s1", "repo:web");
    expect(new URL(calls[1]!.url).pathname).toBe("/workspaces/w1/snapshots/s1/nodes/repo%3Aweb");
  });

  it("asks for access paths with the permission only when given", async () => {
    const { impl, calls } = fakeFetch(200, { paths: [] });
    const client = createApiClient(config, impl);
    await client.explainAccess("w1", "s1", { subject: "p-contractor", resource: "repo-infra", permission: "write" });
    await client.explainAccess("w1", "s1", { subject: "g-platform", resource: "repo-infra" });
    const [first, second] = calls.map((c) => new URL(c.url));
    expect(first!.pathname).toBe("/workspaces/w1/snapshots/s1/access");
    expect(Object.fromEntries(first!.searchParams)).toEqual({ subject: "p-contractor", resource: "repo-infra", permission: "write" });
    expect(Object.fromEntries(second!.searchParams)).toEqual({ subject: "g-platform", resource: "repo-infra" });
  });

  it("turns the error envelope into an ApiError", async () => {
    const { impl } = fakeFetch(404, { error: { code: "NOT_FOUND", message: "Workspace not found" } });
    const error = await createApiClient(config, impl).getWorkspace("nope").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Workspace not found" });
  });

  it("handles error responses that are not JSON", async () => {
    const { impl } = fakeFetch(503, "<html>down</html>");
    await expect(createApiClient(config, impl).listWorkspaces()).rejects.toMatchObject({
      status: 503,
      code: "HTTP_503",
    });
  });

  it("rejects a 200 response that is not JSON", async () => {
    const { impl } = fakeFetch(200, "not json");
    await expect(createApiClient(config, impl).listWorkspaces()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("reports an unreachable API", async () => {
    const failing = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(createApiClient(config, failing).listWorkspaces()).rejects.toMatchObject({
      status: 502,
      code: "API_UNREACHABLE",
      message: expect.stringContaining("http://api.test"),
    });
  });
});
