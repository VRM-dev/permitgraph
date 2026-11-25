import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessPaths, accessSummary, pathCountNote } from "../src/components/access-paths";
import type { AccessExplanation } from "../src/lib/types";

const granted: AccessExplanation = {
  snapshotId: "s1",
  subject: { id: "p-contractor", kind: "principal", type: "user", label: "Casey Contractor" },
  resource: { id: "repo-infra", kind: "resource", type: "repository", label: "acme/infra" },
  permission: "write",
  effective: "write",
  outcome: "GRANTED",
  totalPaths: 1,
  truncated: false,
  paths: [
    {
      permission: "write",
      nodes: ["p-contractor", "g-contractors", "g-platform", "repo-infra"],
      edges: [
        { id: "member_of:p-contractor->g-contractors", kind: "member_of", from: "p-contractor", to: "g-contractors" },
        { id: "member_of:g-contractors->g-platform", kind: "member_of", from: "g-contractors", to: "g-platform" },
        { id: "grant:write:g-platform->repo-infra", kind: "grant", from: "g-platform", to: "repo-infra", permission: "write" },
      ],
    },
  ],
  nodes: [
    { id: "p-contractor", kind: "principal", type: "user", label: "Casey Contractor" },
    { id: "g-contractors", kind: "group", type: "group", label: "Contractors" },
    { id: "g-platform", kind: "group", type: "group", label: "Platform" },
    { id: "repo-infra", kind: "resource", type: "repository", label: "acme/infra" },
  ],
};

const hrefFor = (id: string) => `/x?node=${id}`;

describe("accessSummary", () => {
  it("states the effective permission", () => {
    expect(accessSummary(granted)).toBe("Casey Contractor has write access to acme/infra.");
  });

  it("explains a permission that is too weak", () => {
    expect(accessSummary({ ...granted, permission: "admin", outcome: "NOT_GRANTED", paths: [], totalPaths: 0 })).toBe(
      "Casey Contractor has only write access to acme/infra, not admin.",
    );
  });

  it("says when there is no access at all", () => {
    expect(accessSummary({ ...granted, effective: null, outcome: "NOT_GRANTED", paths: [] })).toBe(
      "Casey Contractor has no access to acme/infra.",
    );
  });
});

describe("pathCountNote", () => {
  it("counts paths and mentions truncation", () => {
    expect(pathCountNote(granted)).toBe("1 path.");
    expect(pathCountNote({ ...granted, totalPaths: 16, truncated: true })).toBe("Showing 1 of 16 paths.");
    expect(pathCountNote({ ...granted, truncated: true })).toBe("Showing 1 path; the graph is too large to list every path.");
  });
});

describe("AccessPaths", () => {
  const html = renderToStaticMarkup(<AccessPaths result={granted} hrefFor={hrefFor} />);

  it("draws the chain in order with every node linked to the explorer", () => {
    const order = ["p-contractor", "g-contractors", "g-platform", "repo-infra"].map((id) => html.indexOf(`href="/x?node=${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/>member of</g)).toHaveLength(2);
    expect(html).toContain('aria-label="grants write"');
    expect(html).toContain("2 memberships deep");
  });

  it("shows the verdict", () => {
    expect(html).toContain("verdict-granted");
    expect(html).toContain("<strong>Granted</strong>");
  });

  it("explains an empty result", () => {
    const weak = renderToStaticMarkup(
      <AccessPaths result={{ ...granted, permission: "admin", outcome: "NOT_GRANTED", paths: [], totalPaths: 0 }} hrefFor={hrefFor} />,
    );
    expect(weak).toContain("Not granted");
    expect(weak).toContain("No path grants admin");
    const none = renderToStaticMarkup(
      <AccessPaths result={{ ...granted, effective: null, outcome: "NOT_GRANTED", paths: [], totalPaths: 0 }} hrefFor={hrefFor} />,
    );
    expect(none).toContain("No membership chain");
    expect(none).not.toContain('data-testid="access-path"');
  });
});
