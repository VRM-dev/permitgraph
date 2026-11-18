import type { Snapshot, SnapshotSummary } from "./domain.js";
import type { PreparedSnapshot } from "./snapshots.js";

export interface NewSnapshot extends PreparedSnapshot {
  workspaceId: string;
  label: string;
  importedBy: string;
}

/**
 * Persistence boundary for snapshots. There is deliberately no update or
 * delete: a snapshot is fixed once imported. Every read is scoped by
 * workspace, so a snapshot id from another workspace is simply not found.
 */
export interface SnapshotStore {
  createSnapshot(input: NewSnapshot): Promise<SnapshotSummary>;
  /** Newest first. */
  listSnapshots(workspaceId: string): Promise<SnapshotSummary[]>;
  findSnapshot(workspaceId: string, snapshotId: string): Promise<Snapshot | null>;
}
