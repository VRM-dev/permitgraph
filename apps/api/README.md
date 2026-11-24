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
| POST | `/workspaces/:workspaceId/imports/validate` | `{ graph }`; needs `snapshot:import`; dry run, returns a validation report, stores nothing |
| POST | `/workspaces/:workspaceId/snapshots` | `{ label, graph }`; needs `snapshot:import`; `422 INVALID_SNAPSHOT` with the issue list |
| GET | `/workspaces/:workspaceId/snapshots` | Summaries (counts, content hash), newest first |
| GET | `/workspaces/:workspaceId/snapshots/:snapshotId` | Summary plus the full graph |
| GET | `/workspaces/:workspaceId/snapshots/:snapshotId/nodes` | Node search: `q`, `kind`, `type`, `limit` (≤100, default 25), `offset` |
| GET | `/workspaces/:workspaceId/snapshots/:snapshotId/nodes/:nodeId` | One node with its incoming and outgoing edges |

Errors use one envelope: `{ "error": { "code": "...", "message": "..." } }`.
`422 INVALID_SNAPSHOT` adds `errorCount`, `warningCount`, `issues` and
`truncated` to it.

There is no sign-in yet. During development the caller is identified by the
`x-permitgraph-user` header, holding the id of an existing user.

## Snapshots

A snapshot is a graph of principals, groups, membership edges, resources and
optional grants (the `GraphSnapshot` shape from `@permitgraph/evaluator`). On
import the API checks the shape and limits (10,000 nodes per kind, 50,000
memberships, 100,000 grants, 8 MB body; `400` otherwise), then runs the
evaluator's `validateSnapshot`. Every problem is reported at once, each with a
code, the offending id and a path such as `memberships[48].member`; any error
(duplicate id, dangling edge, unknown permission) means `422` and nothing is
stored. At most 100 issues are listed; the counts are always complete.
Duplicate edges are only warnings.

`POST …/imports/validate` runs the same checks as a dry run. For a valid graph
the report also holds the counts and content hash an import would store:

```json
{ "report": { "valid": true, "errorCount": 0, "warningCount": 0, "issues": [], "truncated": false,
  "counts": { "principals": 40, "groups": 9, "memberships": 48, "resources": 6, "grants": 17 },
  "contentHash": "sha256:…" } }
```

What is stored is the normalized graph (`normalizeSnapshot` + `toSnapshot`):
nodes and edges sorted, duplicate edges dropped, display names trimmed. So the
same graph imported with its arrays in a different order gets the same
content hash.

Snapshots are immutable: there is no update or delete route, and PostgreSQL
rejects any `UPDATE` on the `snapshots` table with a trigger. Importing again
creates a new snapshot. Each one records a `sha256:` content hash of the
canonical JSON of the normalized graph, the node and edge counts and who
imported it.

Every snapshot belongs to one workspace and is only read through that
workspace, so ids may repeat between workspaces without any overlap.

## Synthetic seed

`src/seed-data.ts` holds made-up demo data: four users (`u-olivia`,
`u-eddie`, `u-vera`, `u-oscar`, all `@example.test`), workspace `acme`
(Olivia owner, Eddie editor, Vera viewer) and workspace `globex` (Oscar
owner), each with one baseline snapshot including a few grants. The two graphs share some ids on
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

## Graph search

Search reads the normalized graph of one stored snapshot, so any member of
the workspace can use it and snapshots of other workspaces are `404`.

- `q` matches the node id or label (display name), case-insensitively. Exact
  matches come first, then prefix matches, then substring matches; within each
  group nodes are ordered principals → groups → resources, then by id. Each
  hit carries `match: "exact" | "prefix" | "contains"`.
- `kind` is `principal`, `group` or `resource`; `type` is the finer kind
  (`user`, `service`, `group` or a resource kind such as `repository`).
- Without `q` the filtered nodes are listed in that same order.
- `total` counts every match; `limit`/`offset` page through them.

```
GET /workspaces/:id/snapshots/:sid/nodes?q=platform&kind=group
{ "snapshotId": "…", "total": 1, "limit": 25, "offset": 0,
  "nodes": [{ "id": "g-platform", "kind": "group", "type": "group", "label": "Platform", "match": "exact" }] }
```

`…/nodes/:nodeId` returns the node, its `outgoing` edges (memberships it has,
grants it holds) and its `incoming` edges (a group's members, the grants on a
resource), using the edge ids from the normalized graph, plus `neighbours`:
each node at the other end of those edges once, so a client can label them.
Normalized graphs are cached in memory per snapshot; snapshots never change,
so the cache never goes stale.
