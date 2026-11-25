import { PERMISSIONS, type Permission } from "./types";

/** What the access-path inspector shows, kept in the URL so a trace can be linked. */
export interface AccessState {
  /** Principal or group id. */
  subject?: string;
  /** Resource id. */
  resource?: string;
  /** Lowest permission to look for; absent means any access. */
  permission?: Permission;
}

const MAX_ID = 200;

type RawParams = Record<string, string | string[] | undefined>;

function id(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text && text.length <= MAX_ID ? text : undefined;
}

/** Reads the inspector state from URL search params, dropping what the API would reject. */
export function parseAccessState(params: RawParams): AccessState {
  const state: AccessState = {};
  const subject = id(params.subject);
  if (subject) state.subject = subject;
  const resource = id(params.resource);
  if (resource) state.resource = resource;
  const permission = Array.isArray(params.permission) ? params.permission[0] : params.permission;
  if (permission && (PERMISSIONS as readonly string[]).includes(permission)) state.permission = permission as Permission;
  return state;
}

/** Path of the inspector for one snapshot. */
export function accessPath(workspaceId: string, snapshotId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}/access`;
}

/** Link to the inspector at `basePath` with the given state; empty fields are left out. */
export function accessHref(basePath: string, state: AccessState): string {
  const params = new URLSearchParams();
  if (state.subject) params.set("subject", state.subject);
  if (state.resource) params.set("resource", state.resource);
  if (state.permission) params.set("permission", state.permission);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
