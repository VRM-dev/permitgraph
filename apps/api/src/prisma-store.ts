import { Prisma, type PrismaClient } from "@prisma/client";
import type { Member, User, Workspace, WorkspaceRole, WorkspaceWithRole } from "./domain.js";
import { LastOwnerError, SlugTakenError } from "./errors.js";
import type { WorkspaceStore } from "./store.js";

const userSelect = { id: true, email: true, displayName: true } as const;
const workspaceSelect = { id: true, slug: true, name: true, createdAt: true } as const;

export class PrismaWorkspaceStore implements WorkspaceStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findUser(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  }

  async createWorkspace(input: { slug: string; name: string; ownerId: string }): Promise<Workspace> {
    try {
      return await this.prisma.workspace.create({
        data: {
          slug: input.slug,
          name: input.name,
          members: { create: { userId: input.ownerId, role: "OWNER" } },
        },
        select: workspaceSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SlugTakenError(input.slug);
      }
      throw error;
    }
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { role: true, workspace: { select: workspaceSelect } },
      orderBy: { workspace: { slug: "asc" } },
    });
    return rows.map((row) => ({ ...row.workspace, role: row.role }));
  }

  async findWorkspaceForUser(workspaceId: string, userId: string): Promise<WorkspaceWithRole | null> {
    const row = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, workspace: { select: workspaceSelect } },
    });
    return row ? { ...row.workspace, role: row.role } : null;
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { role: true, createdAt: true, user: { select: userSelect } },
      orderBy: { user: { email: "asc" } },
    });
    return rows.map((row) => ({ user: row.user, role: row.role, joinedAt: row.createdAt }));
  }

  async setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<Member> {
    // Serializable so two concurrent demotions can't both pass the owner count.
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
          select: { role: true },
        });
        if (current?.role === "OWNER" && role !== "OWNER") {
          const owners = await tx.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
          if (owners <= 1) throw new LastOwnerError();
        }
        const row = await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId, userId } },
          create: { workspaceId, userId, role },
          update: { role },
          select: { role: true, createdAt: true, user: { select: userSelect } },
        });
        return { user: row.user, role: row.role, joinedAt: row.createdAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
