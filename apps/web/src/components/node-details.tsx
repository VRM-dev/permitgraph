import type { GraphEdge, GraphNode, NodeNeighbourhood } from "../lib/types";
import { KindBadge } from "./badges";

interface Section {
  title: string;
  edges: GraphEdge[];
  /** The end of each edge to list. */
  end: "from" | "to";
}

/**
 * Splits a node's edges into the lists that make sense for its kind:
 * memberships and grants held for principals and groups, members for
 * groups, and grant holders for resources. Empty lists are left out.
 */
export function detailSections(n: Pick<NodeNeighbourhood, "incoming" | "outgoing">): Section[] {
  const sections: Section[] = [
    { title: "Member of", edges: n.outgoing.filter((e) => e.kind === "member_of"), end: "to" },
    { title: "Grants held", edges: n.outgoing.filter((e) => e.kind === "grant"), end: "to" },
    { title: "Members", edges: n.incoming.filter((e) => e.kind === "member_of"), end: "from" },
    { title: "Granted to", edges: n.incoming.filter((e) => e.kind === "grant"), end: "from" },
  ];
  return sections.filter((s) => s.edges.length > 0);
}

export function NodeDetails({ data, hrefFor }: { data: NodeNeighbourhood; hrefFor: (nodeId: string) => string }) {
  const byId = new Map<string, GraphNode>(data.neighbours.map((n) => [n.id, n]));
  const sections = detailSections(data);

  if (sections.length === 0) return <p className="muted">This node has no memberships or grants.</p>;

  return (
    <div className="sections">
      {sections.map((section) => (
        <section key={section.title} data-testid={`section-${section.title.toLowerCase().replace(/\s+/g, "-")}`}>
          <h3>
            {section.title} <span className="muted">({section.edges.length})</span>
          </h3>
          <ul className="edge-list">
            {section.edges.map((edge) => {
              const otherId = edge[section.end];
              const other = byId.get(otherId);
              return (
                <li key={edge.id}>
                  <a href={hrefFor(otherId)}>{other?.label ?? otherId}</a>
                  {other && <KindBadge node={other} />}
                  {edge.kind === "grant" && <span className={`badge badge-perm-${edge.permission}`}>{edge.permission}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
