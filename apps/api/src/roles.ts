import type { WorkspaceRole } from "./domain.js";

/**
 * What each workspace role may do. Routes ask for an action, never a role,
 * so new routes only have to pick the right action.
 */
export const ACTIONS = ["workspace:read", "snapshot:import", "members:manage"] as const;
export type Action = (typeof ACTIONS)[number];

const PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Action>> = {
  OWNER: new Set<Action>(["workspace:read", "snapshot:import", "members:manage"]),
  EDITOR: new Set<Action>(["workspace:read", "snapshot:import"]),
  VIEWER: new Set<Action>(["workspace:read"]),
};

export function can(role: WorkspaceRole, action: Action): boolean {
  return PERMISSIONS[role].has(action);
}
