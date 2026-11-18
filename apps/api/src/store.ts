import type { Member, User, Workspace, WorkspaceRole, WorkspaceWithRole } from "./domain.js";

/**
 * Persistence boundary for workspaces and roles. The API talks only to this
 * interface: `PrismaWorkspaceStore` backs it with PostgreSQL, and
 * `InMemoryWorkspaceStore` keeps route tests free of a database.
 */
export interface WorkspaceStore {
  findUser(userId: string): Promise<User | null>;
  /** Creates the workspace with `ownerId` as its first OWNER. Throws `SlugTakenError`. */
  createWorkspace(input: { slug: string; name: string; ownerId: string }): Promise<Workspace>;
  listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]>;
  /** The workspace as seen by `userId`, or null if it doesn't exist or they aren't a member. */
  findWorkspaceForUser(workspaceId: string, userId: string): Promise<WorkspaceWithRole | null>;
  listMembers(workspaceId: string): Promise<Member[]>;
  /** Adds or updates a membership. Throws `LastOwnerError` when demoting the only owner. */
  setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<Member>;
}
