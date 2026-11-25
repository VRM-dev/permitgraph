# @permitgraph/evaluator

Standalone graph evaluator for PermitGraph. It takes a snapshot of principals,
groups, membership edges and resources as plain data and answers access
questions about it. It has no runtime dependencies and does no I/O, so the API,
the web app and tests all use the same logic.

```ts
import { buildGraph, checkDirectMembership } from "@permitgraph/evaluator";

const graph = buildGraph(snapshot); // throws GraphError on duplicate ids or dangling edges
graph.groupsOf.get("u-contractor"); // direct groups of a principal

checkDirectMembership(graph, "u-alice", "g-engineering");
// { member: "u-alice", group: "g-engineering", outcome: "MEMBER",
//   edge: { member: "u-alice", group: "g-engineering" } }
```

`checkDirectMembership` only looks at edges listed in the snapshot. Access
inherited through nested groups is reported as `NOT_MEMBER` by this query.
Unknown ids throw `GraphError` (`UNKNOWN_MEMBER` / `UNKNOWN_GROUP`) instead
of returning `NOT_MEMBER`.

### Grants and normalization

A snapshot may also list `grants` (`{ subject, resource, permission }`, with
`permission` one of `read` < `write` < `admin`). The subject is a principal or
a group; `buildGraph` rejects unknown subjects (`UNKNOWN_SUBJECT`), targets
that are not resources (`UNKNOWN_RESOURCE`) and other permissions
(`INVALID_PERMISSION`). `grants` is optional, so older snapshots stay valid.

`normalizeSnapshot(snapshot)` returns one sorted `nodes` list and one sorted
`edges` list (`member_of` and `grant` edges) with duplicates removed and
stable edge ids such as `member_of:g-contractors->g-engineering` or
`grant:write:g-contractors->repo-web`. The same graph gives the same result
whatever order its arrays were in, and `toSnapshot` turns it back into a
snapshot (`normalizeSnapshot(toSnapshot(n))` equals `n`).

`validateSnapshot(snapshot)` checks the whole snapshot and returns a report
instead of throwing: `valid`, error and warning counts, and every issue with
its `code`, `ref` and `path` (e.g. `grants[3].permission`), errors first and
capped by `maxIssues` (default 100). It is valid exactly when `buildGraph`
accepts the snapshot. Duplicate memberships and grants are warnings
(`DUPLICATE_MEMBERSHIP`, `DUPLICATE_GRANT`), since normalization drops them.

### Access paths

`explainAccess(graph, subject, resource, { permission? })` explains how a
principal or group reaches a resource. Membership is transitive and a higher
permission includes the lower ones. It returns `effective` (strongest
permission reached, or `null`), `outcome` (`GRANTED` / `NOT_GRANTED` for the
requested permission, or for any access) and `paths`: each with `via` (subject
→ … → grant holder), the `memberships` followed and the `grant`, strongest
first, then shortest. Membership cycles are not followed twice. `maxPaths`
(20), `maxDepth` (32) and `maxSteps` (10 000) bound the listing and set
`truncated`; `effective` and `outcome` come from plain reachability and stay
exact. Unknown ids throw `UNKNOWN_SUBJECT` / `UNKNOWN_RESOURCE`.

Tests use two synthetic snapshots: `test/fixtures/tiny-org.ts` and the
40-identity `test/fixtures/sample-org.ts` (34 users, 6 service accounts,
nested groups and grants on six repositories).

```sh
pnpm --filter @permitgraph/evaluator test
pnpm --filter @permitgraph/evaluator typecheck
```

The root `pnpm lint` enforces the no-I/O rule: code under `src/` may not
import Node built-ins or use `fetch`, `process`, timers, `Math.random` or
`Date.now`. CI runs lint, typecheck, tests and build on every push to `main`
and on pull requests.
