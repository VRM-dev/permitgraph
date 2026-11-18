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

Tests use the synthetic `test/fixtures/tiny-org.ts` snapshot.

```sh
pnpm --filter @permitgraph/evaluator test
pnpm --filter @permitgraph/evaluator typecheck
```
