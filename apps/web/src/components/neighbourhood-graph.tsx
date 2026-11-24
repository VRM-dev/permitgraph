import type { NeighbourhoodLayout, PlacedNode } from "../lib/neighbourhood-layout";
import { truncate } from "../lib/neighbourhood-layout";

const BOX = { width: 180, height: 32 } as const;

interface Props {
  layout: NeighbourhoodLayout;
  /** Link for a node; selecting a neighbour moves the explorer to it. */
  hrefFor: (nodeId: string) => string;
}

/**
 * The selected node and its direct edges as an SVG: who points at it on the
 * left, what it points at on the right. Rendered on the server; every
 * neighbour is a plain link, so it works without client JavaScript.
 */
export function NeighbourhoodGraph({ layout, hrefFor }: Props) {
  const { centre, left, right } = layout;
  const summary =
    `${centre.node.label}: ${left.length + layout.hiddenLeft} incoming, ` +
    `${right.length + layout.hiddenRight} outgoing neighbours`;

  return (
    <svg
      className="graph"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label={summary}
      data-testid="neighbourhood-graph"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="graph-arrow" />
        </marker>
      </defs>

      {left.map((n) => (
        <Edge key={`edge-${n.key}`} from={n} to={centre} labels={n.edgeLabels} />
      ))}
      {right.map((n) => (
        <Edge key={`edge-${n.key}`} from={centre} to={n} labels={n.edgeLabels} />
      ))}

      {left.map((n) => (
        <NodeBox key={n.key} placed={n} href={hrefFor(n.node.id)} />
      ))}
      <NodeBox placed={centre} selected />
      {right.map((n) => (
        <NodeBox key={n.key} placed={n} href={hrefFor(n.node.id)} />
      ))}

      {layout.hiddenLeft > 0 && (
        <text x={left[0]?.x ?? 0} y={layout.height - 8} textAnchor="middle" className="graph-more">
          +{layout.hiddenLeft} more
        </text>
      )}
      {layout.hiddenRight > 0 && (
        <text x={right[0]?.x ?? 0} y={layout.height - 8} textAnchor="middle" className="graph-more">
          +{layout.hiddenRight} more
        </text>
      )}
    </svg>
  );
}

function Edge({ from, to, labels }: { from: PlacedNode; to: PlacedNode; labels: string[] }) {
  const x1 = from.x + BOX.width / 2;
  const x2 = to.x - BOX.width / 2;
  const grant = labels.some((l) => l !== "member of");
  return (
    <g className={grant ? "graph-edge graph-edge-grant" : "graph-edge"}>
      <line x1={x1} y1={from.y} x2={x2} y2={to.y} markerEnd="url(#arrow)" />
      <text x={(x1 + x2) / 2} y={(from.y + to.y) / 2 - 4} textAnchor="middle">
        {labels.join(", ")}
      </text>
    </g>
  );
}

function NodeBox({ placed, href, selected = false }: { placed: PlacedNode; href?: string; selected?: boolean }) {
  const { node, x, y } = placed;
  const box = (
    <g className={`graph-node graph-node-${node.kind}${selected ? " graph-node-selected" : ""}`}>
      <title>{`${node.label} (${node.type}: ${node.id})`}</title>
      <rect
        x={x - BOX.width / 2}
        y={y - BOX.height / 2}
        width={BOX.width}
        height={BOX.height}
        rx={node.kind === "principal" ? BOX.height / 2 : node.kind === "group" ? 8 : 2}
      />
      <text x={x} y={y + 4} textAnchor="middle">
        {truncate(node.label, 24)}
      </text>
    </g>
  );
  return href ? <a href={href}>{box}</a> : box;
}
