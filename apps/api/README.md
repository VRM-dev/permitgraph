# @permitgraph/api

Fastify API for PermitGraph. This first slice covers workspaces and workspace
roles; snapshot imports build on it.

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

Errors use one envelope: `{ "error": { "code": "...", "message": "..." } }`.

There is no sign-in yet. During development the caller is identified by the
`x-permitgraph-user` header, holding the id of an existing user.

## Storage

`prisma/schema.prisma` defines `users`, `workspaces` and `workspace_members`
(role enum `OWNER | EDITOR | VIEWER`). Routes use the `WorkspaceStore`
interface: `PrismaWorkspaceStore` for PostgreSQL, `InMemoryWorkspaceStore`
for tests, so `pnpm test` needs no database.

```sh
docker compose up -d postgres              # from the repo root
cp .env.example apps/api/.env
pnpm --filter @permitgraph/api db:migrate
pnpm --filter @permitgraph/api dev
pnpm --filter @permitgraph/api test
```
