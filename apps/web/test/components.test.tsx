import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NeighbourhoodGraph } from "../src/components/neighbourhood-graph";
import { NodeDetails, detailSections } from "../src/components/node-details";
import { layoutNeighbourhood } from "../src/lib/neighbourhood-layout";
import type { NodeNeighbourhood } from "../src/lib/types";

const data: NodeNeighbourhood = {
  snapshotId: "s1",
  node: { id: "g-contractors", kind: "group", type: "group", label: "Contractors" },
  incoming: [{ id: "member_of:p-casey->g-contractors", kind: "member_of", from: "p-casey", to: "g-contractors" }],
  outgoing: [
    { id: "member_of:g-contractors->g-engineering", kind: "member_of", from: "g-contractors", to: "g-engineering" },
    { id: "grant:write:g-contractors->repo-web", kind: "grant", from: "g-contractors", to: "repo-web", permission: "write" },
  ],
  neighbours: [
    { id: "p-casey", kind: "principal", type: "user", label: "Casey Contractor" },
    { id: "g-engineering", kind: "group", type: "group", label: "Engineering" },
    { id: "repo-web", kind: "resource", type: "repository", label: "acme/web" },
  ],
};

const hrefFor = (id: string) => `/x?node=${id}`;

describe("NeighbourhoodGraph", () => {
  const html = renderToStaticMarkup(<NeighbourhoodGraph layout={layoutNeighbourhood(data)} hrefFor={hrefFor} />);

  it("links every neighbour but not the selected node", () => {
    expect(html).toContain('href="/x?node=p-casey"');
    expect(html).toContain('href="/x?node=g-engineering"');
    expect(html).toContain('href="/x?node=repo-web"');
    expect(html).not.toContain('href="/x?node=g-contractors"');
  });

  it("labels edges and describes the picture", () => {
    expect(html).toContain(">member of<");
    expect(html).toContain(">write<");
    expect(html).toContain('aria-label="Contractors: 1 incoming, 2 outgoing neighbours"');
    expect(html).toContain("graph-edge-grant");
  });

  it("says how many neighbours are not drawn", () => {
    const many: NodeNeighbourhood = {
      ...data,
      incoming: Array.from({ length: 15 }, (_, i) => ({
        id: `member_of:p-${i}->g-contractors`,
        kind: "member_of" as const,
        from: `p-${i}`,
        to: "g-contractors",
      })),
    };
    expect(renderToStaticMarkup(<NeighbourhoodGraph layout={layoutNeighbourhood(many)} hrefFor={hrefFor} />)).toContain(
      "+3 more",
    );
  });
});

describe("NodeDetails", () => {
  it("groups edges by meaning", () => {
    expect(detailSections(data).map((s) => s.title)).toEqual(["Member of", "Grants held", "Members"]);
  });

  it("lists neighbours by label with the grant permission", () => {
    const html = renderToStaticMarkup(<NodeDetails data={data} hrefFor={hrefFor} />);
    expect(html).toContain(">Casey Contractor</a>");
    expect(html).toContain(">acme/web</a>");
    expect(html).toContain("badge-perm-write");
  });

  it("says when a node has no edges", () => {
    const html = renderToStaticMarkup(<NodeDetails data={{ ...data, incoming: [], outgoing: [] }} hrefFor={hrefFor} />);
    expect(html).toContain("no memberships or grants");
  });
});
