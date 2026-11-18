# @permitgraph/api

Fastify API for PermitGraph: workspaces, workspace roles and immutable
snapshot imports.

## Roles

| Action | OWNER | EDITOR | VIEWER |
|---|---|---|---|
| `workspace:read` (workspace, members) | ✅ | ✅ | ✅ |
| `snapshot:import` | ✅ | ✅ | |
| `members:manage` | ✅ | | |

Routes check an action, not a role (`src/roles.ts`). A workspace always keeps
at least one owner. Callers that aren't members get `404`, so workspace ids
don't reveal anything across tenants.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | No authentication |
| GET | `/workspaces` | Workspaces the caller belongs to, with their role |
| POST | `/workspaces` | `{ slug, name }`; the caller becomes OWNER; `409 SLUG_TAKEN` |
| GET | `/workspaces/:workspaceId` | Any member |
| GET | `/workspaces/:workspaceId/members` | Any member |
| PUT | `/workspaces/:workspaceId/members/:userId` | `{ role }`; owners only; `409 LAST_OWNER` |
| POST | `/workspaces/:workspaceId/snapshots` | `{ label, graph }`; needs `snapshot:import`; `422 INVALID_SNAPSHOT` |
| GET | `/workspaces/:workspaceId/snapshots` | Summaries (counts, content hash), newest first |
| GET | `/workspaces/:workspaceId/snapshots/:snapshotId` | Summary plus the full graph |

Errors use one envelope: `{ "error": { "code": "...", "message": "..." } }`.

There is no sign-in yet. During development the caller is identified by the
`x-permitgraph-user` header, holding the id of an existing user.

## Snapshots

A snapshot is a graph of principals, groups, membership edges and resources
(the `GraphSnapshot` shape from `@permitgraph/evaluator`). On import the API
validates the shape and limits (10,000 nodes per kind, 50,000 memberships,
8 MB body), then runs the evaluator's `buildGraph`, so duplicate ids and
dangling edges are rejected with `422` before anything is stored.

Snapshots are immutable: there is no update or delete route, and PostgreSQL
rejects any `UPDATE` on the `snapshots` table with a trigger. Importing again
creates a new snapshot. Each one records a `sha256:` content hash of its
canonical JSON (sorted object keys, array order kept), the node counts and who
imported it.

Every snapshot belongs to one workspace and is only read through that
workspace, so ids may repeat between workspaces without any overlap.

## Synthetic seed

`src/seed-data.ts` holds made-up demo data: four users (`u-olivia`,
`u-eddie`, `u-vera`, `u-oscar`, all `@example.test`), workspace `acme`
(Olivia owner, Eddie editor, Vera viewer) and workspace `globex` (Oscar
owner), each with one baseline snapshot. The two graphs share some ids on
purpose to show that workspaces stay separate. Seeding is idempotent.

```sh
pnpm --filter @permitgraph/api db:seed
curl -H 'x-permitgraph-user: u-vera' http://127.0.0.1:3001/workspaces
```

## Storage

`prisma/schema.prisma` defines `users`, `workspaces`, `workspace_members`
(role enum `OWNER | EDITOR | VIEWER`) and `snapshots` (graph as JSONB plus
counts and content hash). Routes use the `WorkspaceStore` and `SnapshotStore`
interfaces, backed by Prisma for PostgreSQL and by in-memory stores in tests,
so `pnpm test` needs no database.

During typecheck, tests and `dev`, `@permitgraph/evaluator` resolves to its
TypeScript sources; `pnpm build` builds the evaluator first and the API uses
its `dist` output.

```sh
docker compose up -d postgres              # from the repo root
cp .env.example apps/api/.env
pnpm --filter @permitgraph/api db:migrate
pnpm --filter @permitgraph/api db:seed
pnpm --filter @permitgraph/api dev
pnpm --filter @permitgraph/api test
```
