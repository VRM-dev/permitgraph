import type { GraphSnapshot } from "@permitgraph/evaluator";

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

export interface SnapshotCounts {
  principals: number;
  groups: number;
  memberships: number;
  resources: number;
  grants: number;
}

/** Snapshot metadata, without the (possibly large) graph. */
export interface SnapshotSummary {
  id: string;
  workspaceId: string;
  label: string;
  /** `sha256:` + hex digest of the canonical JSON of the graph. */
  contentHash: string;
  counts: SnapshotCounts;
  importedBy: string;
  createdAt: Date;
}

export interface Snapshot extends SnapshotSummary {
  graph: GraphSnapshot;
}
