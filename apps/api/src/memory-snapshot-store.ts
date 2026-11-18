import { randomUUID } from "node:crypto";
import type { Snapshot, SnapshotSummary } from "./domain.js";
import type { NewSnapshot, SnapshotStore } from "./snapshot-store.js";

export class InMemorySnapshotStore implements SnapshotStore {
  /** workspaceId → snapshots in import order */
  private readonly byWorkspace = new Map<string, Snapshot[]>();

  async createSnapshot(input: NewSnapshot): Promise<SnapshotSummary> {
    const snapshot: Snapshot = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      label: input.label,
      contentHash: input.contentHash,
      counts: { ...input.counts },
      importedBy: input.importedBy,
      createdAt: new Date(),
      // Stored as a private copy so later changes to the caller's object can't leak in.
      graph: structuredClone(input.graph),
    };
    const list = this.byWorkspace.get(input.workspaceId);
    if (list) list.push(snapshot);
    else this.byWorkspace.set(input.workspaceId, [snapshot]);
    return summary(snapshot);
  }

  async listSnapshots(workspaceId: string): Promise<SnapshotSummary[]> {
    return [...(this.byWorkspace.get(workspaceId) ?? [])].reverse().map(summary);
  }

  async findSnapshot(workspaceId: string, snapshotId: string): Promise<Snapshot | null> {
    const found = this.byWorkspace.get(workspaceId)?.find((s) => s.id === snapshotId);
    return found ? structuredClone(found) : null;
  }
}

function summary(snapshot: Snapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    workspaceId: snapshot.workspaceId,
    label: snapshot.label,
    contentHash: snapshot.contentHash,
    counts: { ...snapshot.counts },
    importedBy: snapshot.importedBy,
    createdAt: snapshot.createdAt,
  };
}
