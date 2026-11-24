import type { GraphNode, NodeHit } from "../lib/types";

export function KindBadge({ node }: { node: Pick<GraphNode, "kind" | "type"> }) {
  return <span className={`badge badge-${node.kind}`}>{node.type}</span>;
}

export function MatchBadge({ match }: { match: NodeHit["match"] }) {
  return match ? <span className="badge badge-match">{match}</span> : null;
}
