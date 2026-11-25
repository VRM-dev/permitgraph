import { Fragment } from "react";
import type { AccessExplanation, AccessPath, GraphNode } from "../lib/types";
import { KindBadge } from "./badges";

type HrefFor = (nodeId: string) => string;

/** One-line answer: does the subject reach the resource, and how strongly? */
export function accessSummary(result: AccessExplanation): string {
  const who = result.subject.label;
  const what = result.resource.label;
  if (result.effective === null) return `${who} has no access to ${what}.`;
  if (result.outcome === "NOT_GRANTED") {
    return `${who} has only ${result.effective} access to ${what}, not ${result.permission}.`;
  }
  return `${who} has ${result.effective} access to ${what}.`;
}

/** "Showing 2 of 2 paths", or a note when some were left out. */
export function pathCountNote(result: AccessExplanation): string {
  const noun = result.totalPaths === 1 ? "path" : "paths";
  if (result.truncated && result.paths.length < result.totalPaths) {
    return `Showing ${result.paths.length} of ${result.totalPaths} ${noun}.`;
  }
  if (result.truncated) return `Showing ${result.paths.length} ${noun}; the graph is too large to list every path.`;
  return `${result.totalPaths} ${noun}.`;
}

function PathChain({ path, nodes, hrefFor }: { path: AccessPath; nodes: ReadonlyMap<string, GraphNode>; hrefFor: HrefFor }) {
  return (
    <ol className="path-chain">
      {path.nodes.map((nodeId, i) => {
        const node = nodes.get(nodeId);
        const edge = path.edges[i];
        return (
          <Fragment key={nodeId}>
            <li className={`path-node path-node-${node?.kind ?? "unknown"}`}>
              <a href={hrefFor(nodeId)}>{node?.label ?? nodeId}</a>
              {node && <KindBadge node={node} />}
            </li>
            {edge && (
              <li className={`path-edge path-edge-${edge.kind}`} aria-label={edge.kind === "grant" ? `grants ${edge.permission}` : "member of"}>
                {edge.kind === "grant" ? <span className={`badge badge-perm-${edge.permission}`}>{edge.permission}</span> : "member of"}
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * The answer and the evidence: each path from the subject through its
 * groups to the grant on the resource. Every node links back to the
 * explorer so a reviewer can check the edges themselves.
 */
export function AccessPaths({ result, hrefFor }: { result: AccessExplanation; hrefFor: HrefFor }) {
  const nodes = new Map(result.nodes.map((n) => [n.id, n]));
  return (
    <div className="access-result">
      <p className={`verdict verdict-${result.outcome === "GRANTED" ? "granted" : "not-granted"}`} role="status">
        <strong>{result.outcome === "GRANTED" ? "Granted" : "Not granted"}</strong> — {accessSummary(result)}
      </p>
      {result.paths.length > 0 ? (
        <>
          <p className="muted" data-testid="path-count">
            {pathCountNote(result)}
          </p>
          <ul className="paths">
            {result.paths.map((path) => (
              <li key={path.edges.map((e) => e.id).join("|")} data-testid="access-path">
                <PathChain path={path} nodes={nodes} hrefFor={hrefFor} />
                <span className="muted">
                  {path.edges.length === 1 ? "direct grant" : `${path.edges.length - 1} membership${path.edges.length > 2 ? "s" : ""} deep`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : result.effective !== null ? (
        <p className="muted">No path grants {result.permission}. Clear the permission to see the weaker paths.</p>
      ) : (
        <p className="muted">No membership chain from this subject ends in a grant on this resource.</p>
      )}
    </div>
  );
}
