# @permitgraph/evaluator

Standalone graph evaluator for PermitGraph. It takes a snapshot of principals,
groups, membership edges and resources as plain data and answers access
questions about it. It has no runtime dependencies and does no I/O, so the API,
the web app and tests all use the same logic.

```ts
import { buildGraph } from "@permitgraph/evaluator";

const graph = buildGraph(snapshot); // throws GraphError on duplicate ids or dangling edges
graph.groupsOf.get("u-contractor"); // direct groups of a principal
```

```sh
pnpm --filter @permitgraph/evaluator test
pnpm --filter @permitgraph/evaluator typecheck
```
