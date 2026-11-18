export const WORKSPACE_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export interface Member {
  user: User;
  role: WorkspaceRole;
  joinedAt: Date;
}
