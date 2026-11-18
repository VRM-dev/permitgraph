import { randomUUID } from "node:crypto";
import type { Member, User, Workspace, WorkspaceRole, WorkspaceWithRole } from "./domain.js";
import { LastOwnerError, SlugTakenError } from "./errors.js";
import type { WorkspaceStore } from "./store.js";

interface StoredMembership {
  role: WorkspaceRole;
  joinedAt: Date;
}

export class InMemoryWorkspaceStore implements WorkspaceStore {
  private readonly users = new Map<string, User>();
  private readonly workspaces = new Map<string, Workspace>();
  /** workspaceId → userId → membership */
  private readonly memberships = new Map<string, Map<string, StoredMembership>>();

  constructor(users: readonly User[] = []) {
    for (const user of users) this.users.set(user.id, { ...user });
  }

  async findUser(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async createWorkspace(input: { slug: string; name: string; ownerId: string }): Promise<Workspace> {
    for (const existing of this.workspaces.values()) {
      if (existing.slug === input.slug) throw new SlugTakenError(input.slug);
    }
    const now = new Date();
    const workspace: Workspace = { id: randomUUID(), slug: input.slug, name: input.name, createdAt: now };
    this.workspaces.set(workspace.id, workspace);
    this.memberships.set(workspace.id, new Map([[input.ownerId, { role: "OWNER", joinedAt: now }]]));
    return { ...workspace };
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]> {
    const result: WorkspaceWithRole[] = [];
    for (const workspace of this.workspaces.values()) {
      const membership = this.memberships.get(workspace.id)?.get(userId);
      if (membership) result.push({ ...workspace, role: membership.role });
    }
    return result.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async findWorkspaceForUser(workspaceId: string, userId: string): Promise<WorkspaceWithRole | null> {
    const workspace = this.workspaces.get(workspaceId);
    const membership = this.memberships.get(workspaceId)?.get(userId);
    return workspace && membership ? { ...workspace, role: membership.role } : null;
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const members: Member[] = [];
    for (const [userId, membership] of this.memberships.get(workspaceId) ?? []) {
      const user = this.users.get(userId);
      if (user) members.push({ user: { ...user }, role: membership.role, joinedAt: membership.joinedAt });
    }
    return members.sort((a, b) => a.user.email.localeCompare(b.user.email));
  }

  async setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<Member> {
    const members = this.memberships.get(workspaceId);
    const user = this.users.get(userId);
    if (!members || !user) throw new Error("Unknown workspace or user");

    const current = members.get(userId);
    if (current?.role === "OWNER" && role !== "OWNER") {
      const owners = [...members.values()].filter((m) => m.role === "OWNER").length;
      if (owners <= 1) throw new LastOwnerError();
    }

    const membership: StoredMembership = { role, joinedAt: current?.joinedAt ?? new Date() };
    members.set(userId, membership);
    return { user: { ...user }, role, joinedAt: membership.joinedAt };
  }
}
