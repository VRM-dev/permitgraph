import type { SnapshotStore } from "./snapshot-store.js";
import { SEED_WORKSPACES, type SeedWorkspace } from "./seed-data.js";
import { prepareSnapshot } from "./snapshots.js";
import type { WorkspaceStore } from "./store.js";

export interface SeedResult {
  workspacesCreated: number;
  snapshotsImported: number;
}

/**
 * Loads the synthetic workspaces, roles and snapshots through the same store
 * interfaces the API uses. Seed users must already exist. Safe to run again:
 * existing workspaces are reused and a snapshot whose content hash is already
 * in the workspace is skipped.
 */
export async function seed(
  stores: { workspaces: WorkspaceStore; snapshots: SnapshotStore },
  data: readonly SeedWorkspace[] = SEED_WORKSPACES,
): Promise<SeedResult> {
  const result: SeedResult = { workspacesCreated: 0, snapshotsImported: 0 };

  for (const spec of data) {
    const owned = await stores.workspaces.listWorkspacesForUser(spec.ownerId);
    let workspace = owned.find((w) => w.slug === spec.slug);
    if (!workspace) {
      const created = await stores.workspaces.createWorkspace({ slug: spec.slug, name: spec.name, ownerId: spec.ownerId });
      workspace = { ...created, role: "OWNER" };
      result.workspacesCreated += 1;
    }

    for (const member of spec.members) {
      await stores.workspaces.setMemberRole(workspace.id, member.userId, member.role);
    }

    const existing = new Set((await stores.snapshots.listSnapshots(workspace.id)).map((s) => s.contentHash));
    for (const snapshot of spec.snapshots) {
      const prepared = prepareSnapshot(snapshot.graph);
      if (existing.has(prepared.contentHash)) continue;
      await stores.snapshots.createSnapshot({
        ...prepared,
        workspaceId: workspace.id,
        label: snapshot.label,
        importedBy: spec.ownerId,
      });
      existing.add(prepared.contentHash);
      result.snapshotsImported += 1;
    }
  }

  return result;
}
