import type { Prisma, PrismaClient } from "@prisma/client";
import type { GraphSnapshot } from "@permitgraph/evaluator";
import type { Snapshot, SnapshotSummary } from "./domain.js";
import type { NewSnapshot, SnapshotStore } from "./snapshot-store.js";

const summarySelect = {
  id: true,
  workspaceId: true,
  label: true,
  contentHash: true,
  principalCount: true,
  groupCount: true,
  membershipCount: true,
  resourceCount: true,
  importedById: true,
  createdAt: true,
} as const;

type SummaryRow = Prisma.SnapshotGetPayload<{ select: typeof summarySelect }>;

export class PrismaSnapshotStore implements SnapshotStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createSnapshot(input: NewSnapshot): Promise<SnapshotSummary> {
    const row = await this.prisma.snapshot.create({
      data: {
        workspaceId: input.workspaceId,
        label: input.label,
        contentHash: input.contentHash,
        graph: input.graph as unknown as Prisma.InputJsonObject,
        principalCount: input.counts.principals,
        groupCount: input.counts.groups,
        membershipCount: input.counts.memberships,
        resourceCount: input.counts.resources,
        importedById: input.importedBy,
      },
      select: summarySelect,
    });
    return toSummary(row);
  }

  async listSnapshots(workspaceId: string): Promise<SnapshotSummary[]> {
    const rows = await this.prisma.snapshot.findMany({
      where: { workspaceId },
      select: summarySelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSummary);
  }

  async findSnapshot(workspaceId: string, snapshotId: string): Promise<Snapshot | null> {
    // Filter on both columns so an id from another workspace is not found.
    const row = await this.prisma.snapshot.findFirst({
      where: { id: snapshotId, workspaceId },
      select: { ...summarySelect, graph: true },
    });
    if (!row) return null;
    // The graph was validated before it was stored and rows are never updated.
    return { ...toSummary(row), graph: row.graph as unknown as GraphSnapshot };
  }
}

function toSummary(row: SummaryRow): SnapshotSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    label: row.label,
    contentHash: row.contentHash,
    counts: {
      principals: row.principalCount,
      groups: row.groupCount,
      memberships: row.membershipCount,
      resources: row.resourceCount,
    },
    importedBy: row.importedById,
    createdAt: row.createdAt,
  };
}
