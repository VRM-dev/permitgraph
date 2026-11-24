import type { NodeKind, NodeNeighbourhood, NodeSearchResult, SnapshotSummary, Workspace } from "./types";

/** An API call that did not return 2xx, or the API could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiConfig {
  /** Base URL of the PermitGraph API, without a trailing slash. */
  baseUrl: string;
  /** Sent as `x-permitgraph-user`; the API has no sign-in yet. */
  userId: string;
}

export const DEFAULT_API_URL = "http://127.0.0.1:3001";
/** Vera is a viewer in the seeded `acme` workspace: enough to explore. */
export const DEFAULT_USER = "u-vera";

export function apiConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const baseUrl = (env.PERMITGRAPH_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
  const userId = env.PERMITGRAPH_USER?.trim() || DEFAULT_USER;
  return { baseUrl, userId };
}

export interface SearchParams {
  q?: string;
  kind?: NodeKind;
  limit?: number;
  offset?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Typed client for the API routes the UI reads. Runs on the server only, so
 * the API URL and the dev identity never reach the browser.
 */
export function createApiClient(config: ApiConfig, fetchImpl: FetchLike = fetch) {
  async function get<T>(segments: readonly string[], query: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${config.baseUrl}/${segments.map(encodeURIComponent).join("/")}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { accept: "application/json", "x-permitgraph-user": config.userId },
        cache: "no-store",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ApiError(502, "API_UNREACHABLE", `Cannot reach the API at ${config.baseUrl}: ${reason}`);
    }

    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
      throw new ApiError(
        response.status,
        typeof envelope?.code === "string" ? envelope.code : `HTTP_${response.status}`,
        typeof envelope?.message === "string" ? envelope.message : `API returned ${response.status}`,
      );
    }
    if (body === undefined) throw new ApiError(502, "BAD_RESPONSE", "API returned a response that is not JSON");
    return body as T;
  }

  return {
    async listWorkspaces(): Promise<Workspace[]> {
      return (await get<{ workspaces: Workspace[] }>(["workspaces"])).workspaces;
    },
    async getWorkspace(workspaceId: string): Promise<Workspace> {
      return (await get<{ workspace: Workspace }>(["workspaces", workspaceId])).workspace;
    },
    async listSnapshots(workspaceId: string): Promise<SnapshotSummary[]> {
      return (await get<{ snapshots: SnapshotSummary[] }>(["workspaces", workspaceId, "snapshots"])).snapshots;
    },
    searchNodes(workspaceId: string, snapshotId: string, params: SearchParams = {}): Promise<NodeSearchResult> {
      return get(["workspaces", workspaceId, "snapshots", snapshotId, "nodes"], {
        q: params.q,
        kind: params.kind,
        limit: params.limit,
        offset: params.offset,
      });
    },
    getNode(workspaceId: string, snapshotId: string, nodeId: string): Promise<NodeNeighbourhood> {
      return get(["workspaces", workspaceId, "snapshots", snapshotId, "nodes", nodeId]);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
