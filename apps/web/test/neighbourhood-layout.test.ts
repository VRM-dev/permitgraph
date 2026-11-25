import { describe, expect, it } from "vitest";
import { LAYOUT, layoutNeighbourhood, truncate } from "../src/lib/neighbourhood-layout";
import type { GraphEdge, GraphNode } from "../src/lib/types";

const contractors: GraphNode = { id: "g-contractors", kind: "group", type: "group", label: "Contractors" };
const nodes: GraphNode[] = [
  { id: "p-casey", kind: "principal", type: "user", label: "Casey Contractor" },
  { id: "p-alex", kind: "principal", type: "user", label: "Alex" },
  { id: "g-engineering", kind: "group", type: "group", label: "Engineering" },
  { id: "repo-web", kind: "resource", type: "repository", label: "acme/web" },
];

const member = (from: string, to: string): GraphEdge => ({ id: `member_of:${from}->${to}`, kind: "member_of", from, to });
const grant = (from: string, to: string, permission: "read" | "write" | "admin"): GraphEdge => ({
  id: `grant:${permission}:${from}->${to}`,
  kind: "grant",
  from,
  to,
  permission,
});

describe("layoutNeighbourhood", () => {
  const layout = layoutNeighbourhood({
    node: contractors,
    incoming: [member("p-casey", "g-contractors"), member("p-alex", "g-contractors")],
    outgoing: [grant("g-contractors", "repo-web", "read"), grant("g-contractors", "repo-web", "write"), member("g-contractors", "g-engineering")],
    neighbours: nodes,
  });

  it("puts incoming edges on the left and outgoing on the right", () => {
    expect(layout.left.map((n) => n.node.id)).toEqual(["p-alex", "p-casey"]);
    expect(layout.right.map((n) => n.node.id)).toEqual(["g-engineering", "repo-web"]);
    expect(layout.left.every((n) => n.x < layout.centre.x)).toBe(true);
    expect(layout.right.every((n) => n.x > layout.centre.x)).toBe(true);
  });

  it("merges several edges to one neighbour into one box", () => {
    expect(layout.right.find((n) => n.node.id === "repo-web")?.edgeLabels).toEqual(["read", "write"]);
    expect(layout.right.find((n) => n.node.id === "g-engineering")?.edgeLabels).toEqual(["member of"]);
  });

  it("keeps every node inside the picture and centres the selected node", () => {
    for (const n of [...layout.left, ...layout.right]) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(layout.height);
    }
    expect(layout.centre.y).toBe(layout.height / 2);
    expect(layout.height).toBe(LAYOUT.minHeight);
  });

  it("caps each side and counts the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) => `p-${String(i).padStart(2, "0")}`);
    const big = layoutNeighbourhood(
      { node: contractors, incoming: many.map((id) => member(id, "g-contractors")), outgoing: [], neighbours: [] },
      10,
    );
    expect(big.left).toHaveLength(10);
    expect(big.hiddenLeft).toBe(20);
    expect(big.left[0]?.node).toEqual({ id: "p-00", kind: "principal", type: "unknown", label: "p-00" });
    expect(big.height).toBe(10 * LAYOUT.rowHeight + 2 * LAYOUT.padding);
    expect(new Set(big.left.map((n) => n.y)).size).toBe(10);
  });

  it("is deterministic regardless of edge order", () => {
    const shuffled = layoutNeighbourhood({
      node: contractors,
      incoming: [member("p-alex", "g-contractors"), member("p-casey", "g-contractors")],
      outgoing: [member("g-contractors", "g-engineering"), grant("g-contractors", "repo-web", "read"), grant("g-contractors", "repo-web", "write")],
      neighbours: [...nodes].reverse(),
    });
    expect(shuffled).toEqual(layout);
  });
});

describe("truncate", () => {
  it("keeps short text and shortens long text", () => {
    expect(truncate("acme/web", 24)).toBe("acme/web");
    expect(truncate("a very long display name here", 10)).toBe("a very lo…");
  });
});
