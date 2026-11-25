import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import type { GraphSnapshot } from "@permitgraph/evaluator";
import {
  WORKSPACE_ROLES,
  type Member,
  type Snapshot,
  type SnapshotSummary,
  type User,
  type Workspace,
  type WorkspaceWithRole,
} from "./domain.js";
import { HttpError, InvalidSnapshotError, LastOwnerError, SlugTakenError } from "./errors.js";
import { can, type Action } from "./roles.js";
import type { SnapshotStore } from "./snapshot-store.js";
import { accessPaths, accessQuerySchema } from "./access-paths.js";
import { NormalizedGraphCache, nodeNeighbourhood, searchNodes, searchQuerySchema } from "./graph-search.js";
import { checkImport, importSnapshotBody, prepareSnapshot, SNAPSHOT_LIMITS, validateImportBody } from "./snapshots.js";
import type { WorkspaceStore } from "./store.js";

/**
 * Development identity header. It stands in for real authentication until
 * sign-in exists; the value is a user id that must already be in the store.
 */
export const USER_HEADER = "x-permitgraph-user";

export interface AppOptions {
  store: WorkspaceStore;
  snapshots: SnapshotStore;
  logger?: boolean;
  /** Normalized graphs kept in memory for search; defaults to 16 snapshots. */
  graphCache?: NormalizedGraphCache;
}

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3-40 lowercase letters, digits or dashes; no leading/trailing dash");
const createWorkspaceBody = z.object({ slug: slugSchema, name: z.string().trim().min(1).max(80) }).strict();
const workspaceParams = z.object({ workspaceId: z.string().min(1).max(64) });
const memberParams = workspaceParams.extend({ userId: z.string().min(1).max(64) });
const setRoleBody = z.object({ role: z.enum(WORKSPACE_ROLES) }).strict();
const snapshotParams = workspaceParams.extend({ snapshotId: z.string().min(1).max(64) });
const nodeParams = snapshotParams.extend({ nodeId: z.string().min(1).max(200) });

export function buildApp(options: AppOptions): FastifyInstance {
  const { store, snapshots } = options;
  const graphCache = options.graphCache ?? new NormalizedGraphCache();
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(envelope(error.code, error.message, error.details));
    }
    if (error instanceof ZodError) {
      const message = error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      return reply.status(400).send(envelope("BAD_REQUEST", message));
    }
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      // Fastify's own client errors, e.g. malformed JSON or a wrong content type.
      return reply.status(status).send(envelope("BAD_REQUEST", (error as Error).message));
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(envelope("INTERNAL", "Internal server error"));
  });

  async function authenticate(request: FastifyRequest): Promise<User> {
    const header = request.headers[USER_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (!userId) throw new HttpError(401, "UNAUTHENTICATED", `Missing ${USER_HEADER} header`);
    const user = await store.findUser(userId);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Unknown user");
    return user;
  }

  /**
   * Loads the workspace for the caller and checks `action`. Non-members get
   * 404, not 403, so workspace ids don't leak across tenants.
   */
  async function authorize(workspaceId: string, user: User, action: Action): Promise<WorkspaceWithRole> {
    const workspace = await store.findWorkspaceForUser(workspaceId, user.id);
    if (!workspace) throw new HttpError(404, "NOT_FOUND", "Workspace not found");
    if (!can(workspace.role, action)) {
      throw new HttpError(403, "FORBIDDEN", `Role ${workspace.role} cannot ${action}`);
    }
    return workspace;
  }

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/workspaces", async (request) => {
    const user = await authenticate(request);
    const workspaces = await store.listWorkspacesForUser(user.id);
    return { workspaces: workspaces.map(workspaceJson) };
  });

  app.post("/workspaces", async (request, reply) => {
    const user = await authenticate(request);
    const body = createWorkspaceBody.parse(request.body);
    try {
      const workspace = await store.createWorkspace({ ...body, ownerId: user.id });
      return reply.status(201).send({ workspace: workspaceJson({ ...workspace, role: "OWNER" }) });
    } catch (error) {
      if (error instanceof SlugTakenError) throw new HttpError(409, "SLUG_TAKEN", error.message);
      throw error;
    }
  });

  app.get("/workspaces/:workspaceId", async (request) => {
    const user = await authenticate(request);
    const { workspaceId } = workspaceParams.parse(request.params);
    const workspace = await authorize(workspaceId, user, "workspace:read");
    return { workspace: workspaceJson(workspace) };
  });

  app.get("/workspaces/:workspaceId/members", async (request) => {
    const user = await authenticate(request);
    const { workspaceId } = workspaceParams.parse(request.params);
    await authorize(workspaceId, user, "workspace:read");
    const members = await store.listMembers(workspaceId);
    return { members: members.map(memberJson) };
  });

  app.put("/workspaces/:workspaceId/members/:userId", async (request) => {
    const user = await authenticate(request);
    const { workspaceId, userId } = memberParams.parse(request.params);
    const { role } = setRoleBody.parse(request.body);
    await authorize(workspaceId, user, "members:manage");
    if (!(await store.findUser(userId))) throw new HttpError(404, "NOT_FOUND", "User not found");
    try {
      return { member: memberJson(await store.setMemberRole(workspaceId, userId, role)) };
    } catch (error) {
      if (error instanceof LastOwnerError) throw new HttpError(409, "LAST_OWNER", error.message);
      throw error;
    }
  });

  app.post(
    "/workspaces/:workspaceId/snapshots",
    { bodyLimit: SNAPSHOT_LIMITS.bodyBytes },
    async (request, reply) => {
      const user = await authenticate(request);
      const { workspaceId } = workspaceParams.parse(request.params);
      await authorize(workspaceId, user, "snapshot:import");
      const body = importSnapshotBody.parse(request.body);
      // Zod leaves absent optional keys absent, so the parsed value matches GraphSnapshot.
      const graph = body.graph as GraphSnapshot;
      try {
        const prepared = prepareSnapshot(graph);
        const snapshot = await snapshots.createSnapshot({ ...prepared, workspaceId, label: body.label, importedBy: user.id });
        return reply.status(201).send({ snapshot: snapshotSummaryJson(snapshot) });
      } catch (error) {
        if (error instanceof InvalidSnapshotError) {
          const { report } = error;
          throw new HttpError(422, "INVALID_SNAPSHOT", error.message, {
            errorCount: report.errorCount,
            warningCount: report.warningCount,
            issues: report.issues,
            truncated: report.truncated,
          });
        }
        throw error;
      }
    },
  );

  /**
   * Dry run of an import: reports every problem in the graph (with paths)
   * and, for a valid graph, the counts and content hash an import would
   * store. Nothing is written. Same permission and size limits as an import.
   */
  app.post(
    "/workspaces/:workspaceId/imports/validate",
    { bodyLimit: SNAPSHOT_LIMITS.bodyBytes },
    async (request) => {
      const user = await authenticate(request);
      const { workspaceId } = workspaceParams.parse(request.params);
      await authorize(workspaceId, user, "snapshot:import");
      const body = validateImportBody.parse(request.body);
      return { report: checkImport(body.graph as GraphSnapshot) };
    },
  );

  app.get("/workspaces/:workspaceId/snapshots", async (request) => {
    const user = await authenticate(request);
    const { workspaceId } = workspaceParams.parse(request.params);
    await authorize(workspaceId, user, "workspace:read");
    const list = await snapshots.listSnapshots(workspaceId);
    return { snapshots: list.map(snapshotSummaryJson) };
  });

  app.get("/workspaces/:workspaceId/snapshots/:snapshotId", async (request) => {
    const user = await authenticate(request);
    const { workspaceId, snapshotId } = snapshotParams.parse(request.params);
    await authorize(workspaceId, user, "workspace:read");
    const snapshot = await snapshots.findSnapshot(workspaceId, snapshotId);
    if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Snapshot not found");
    return { snapshot: snapshotJson(snapshot) };
  });

  /** Loads a snapshot of the caller's workspace and its normalized graph. */
  async function readGraph(request: FastifyRequest, workspaceId: string, snapshotId: string) {
    const user = await authenticate(request);
    await authorize(workspaceId, user, "workspace:read");
    const snapshot = await snapshots.findSnapshot(workspaceId, snapshotId);
    if (!snapshot) throw new HttpError(404, "NOT_FOUND", "Snapshot not found");
    return { snapshot, graph: graphCache.get(snapshot.id, snapshot.graph) };
  }

  /**
   * Searches the nodes of one snapshot by id or label (`q`), narrowed by
   * `kind` (principal/group/resource) and `type` (user, service, group or a
   * resource kind). Results are ranked exact, prefix, then substring and
   * paged with `limit`/`offset`.
   */
  app.get("/workspaces/:workspaceId/snapshots/:snapshotId/nodes", async (request) => {
    const { workspaceId, snapshotId } = snapshotParams.parse(request.params);
    const query = searchQuerySchema.parse(request.query);
    const { snapshot, graph } = await readGraph(request, workspaceId, snapshotId);
    return { snapshotId: snapshot.id, ...searchNodes(graph, query) };
  });

  /** One node with its direct incoming and outgoing edges. */
  app.get("/workspaces/:workspaceId/snapshots/:snapshotId/nodes/:nodeId", async (request) => {
    const { workspaceId, snapshotId, nodeId } = nodeParams.parse(request.params);
    const { snapshot, graph } = await readGraph(request, workspaceId, snapshotId);
    const found = nodeNeighbourhood(graph, nodeId);
    if (!found) throw new HttpError(404, "NOT_FOUND", "Node not found in this snapshot");
    return { snapshotId: snapshot.id, ...found };
  });

  /**
   * Access-path inspector: how `subject` (principal or group) reaches
   * `resource`, optionally for at least `permission`. Returns the effective
   * permission, GRANTED/NOT_GRANTED and up to `limit` paths of membership
   * edges ending in a grant, strongest and shortest first.
   */
  app.get("/workspaces/:workspaceId/snapshots/:snapshotId/access", async (request) => {
    const { workspaceId, snapshotId } = snapshotParams.parse(request.params);
    const query = accessQuerySchema.parse(request.query);
    const { snapshot, graph } = await readGraph(request, workspaceId, snapshotId);
    const access = graphCache.accessGraph(snapshot.id, snapshot.graph);
    return { snapshotId: snapshot.id, ...accessPaths(graph, access, query) };
  });

  return app;
}

function envelope(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...details } };
}

function workspaceJson(workspace: Workspace & { role?: string }) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    createdAt: workspace.createdAt.toISOString(),
    ...(workspace.role ? { role: workspace.role } : {}),
  };
}

function memberJson(member: Member) {
  return {
    userId: member.user.id,
    email: member.user.email,
    displayName: member.user.displayName,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}

function snapshotSummaryJson(snapshot: SnapshotSummary) {
  return {
    id: snapshot.id,
    label: snapshot.label,
    contentHash: snapshot.contentHash,
    counts: snapshot.counts,
    importedBy: snapshot.importedBy,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

function snapshotJson(snapshot: Snapshot) {
  return { ...snapshotSummaryJson(snapshot), graph: snapshot.graph };
}
