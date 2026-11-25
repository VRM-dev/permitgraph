# @permitgraph/web

Next.js (App Router) UI for PermitGraph. It reads everything from the API in
[`apps/api`](../api/README.md); pages are rendered on the server, so the API
URL and the development identity never reach the browser, and the explorer
works with plain links and forms.

## Pages

| Path | Shows |
|---|---|
| `/` | Workspaces of the current user, with their role |
| `/workspaces/:workspaceId` | The workspace's snapshots with node and edge counts |
| `/workspaces/:workspaceId/snapshots/:snapshotId` | Graph explorer |
| `/workspaces/:workspaceId/snapshots/:snapshotId/access` | Access-path inspector |

## Graph explorer

- **Search** by name or id, optionally narrowed to principals, groups or
  resources. Results come from the API's node search (exact matches first,
  then prefix, then substring), 25 per page.
- **Select** a node to see its direct neighbourhood: nodes with an edge into
  it on the left (a group's members, a resource's grant holders), the node in
  the middle, and what it points to on the right (its groups, the resources
  it holds grants on). Membership edges are solid, grants dashed and labelled
  with the permission; several grants to one neighbour share a box. Each side
  draws at most 12 neighbours and says how many more there are.
- Below the picture every edge is listed by meaning: *Member of*,
  *Grants held*, *Members*, *Granted to*.
- Every neighbour is a link, so you can walk the graph one hop at a time, for
  example from a contractor to `g-contractors` to the `repo-web` write grant.
  The search, page and selected node live in the URL, so any view can be
  shared.

## Access-path inspector

Enter a subject (user, service or group id) and a resource (suggested from the
snapshot's resources), optionally with the lowest permission to look for. The
page says whether access is granted and the strongest permission reached, then
lists each path as a chain — e.g. *Casey Contractor → member of → Contractors →
member of → Platform → write → acme/infra* — strongest and shortest first.
Every node links back to the explorer. From the explorer, a selected principal
or group links to "Trace its access" and a resource to "Trace who can reach
it". Subject, resource and permission live in the URL.

## Configuration

Set in `apps/web/.env.local` or the environment:

| Variable | Default | Meaning |
|---|---|---|
| `PERMITGRAPH_API_URL` | `http://127.0.0.1:3001` | Base URL of the API |
| `PERMITGRAPH_USER` | `u-vera` | Sent as `x-permitgraph-user`; any seeded user id |

There is no sign-in yet; the UI acts as that one user. With the synthetic seed,
`u-vera` is a viewer in `acme` and `u-oscar` the owner of `globex`.

## Development

```sh
pnpm --filter @permitgraph/api dev     # API on :3001 (needs PostgreSQL and the seed)
pnpm --filter @permitgraph/web dev     # http://localhost:3000
pnpm --filter @permitgraph/web test    # Vitest: API client, URL state, layout, SVG and path rendering
```
