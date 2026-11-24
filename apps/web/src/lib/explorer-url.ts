import { NODE_KINDS, type NodeKind } from "./types";

/** What the explorer shows, kept in the URL so every view can be linked. */
export interface ExplorerState {
  q?: string;
  kind?: NodeKind;
  offset?: number;
  /** Id of the selected node. */
  node?: string;
}

export const PAGE_SIZE = 25;
const MAX_QUERY = 200;
const MAX_NODE_ID = 200;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the explorer state from URL search params. Anything the API would
 * reject (unknown kind, negative or misaligned offset, oversized text) is
 * dropped or clamped instead of turning into an error page.
 */
export function parseExplorerState(params: RawParams): ExplorerState {
  const state: ExplorerState = {};

  const q = first(params.q)?.trim();
  if (q) state.q = q.slice(0, MAX_QUERY);

  const kind = first(params.kind);
  if (kind && (NODE_KINDS as readonly string[]).includes(kind)) state.kind = kind as NodeKind;

  const offset = Number(first(params.offset));
  const aligned = Number.isInteger(offset) && offset > 0 ? offset - (offset % PAGE_SIZE) : 0;
  if (aligned > 0) state.offset = aligned;

  const node = first(params.node)?.trim();
  if (node && node.length <= MAX_NODE_ID) state.node = node;

  return state;
}

/** Link to the explorer at `basePath` with the given state; empty fields are left out. */
export function explorerHref(basePath: string, state: ExplorerState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.kind) params.set("kind", state.kind);
  if (state.offset) params.set("offset", String(state.offset));
  if (state.node) params.set("node", state.node);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Path of the explorer for one snapshot. */
export function explorerPath(workspaceId: string, snapshotId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}`;
}
