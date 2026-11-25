import { describe, expect, it } from "vitest";
import { PAGE_SIZE, explorerHref, explorerPath, parseExplorerState } from "../src/lib/explorer-url";

describe("parseExplorerState", () => {
  it("reads query, kind, offset and node", () => {
    expect(parseExplorerState({ q: " platform ", kind: "group", offset: "25", node: "g-platform" })).toEqual({
      q: "platform",
      kind: "group",
      offset: 25,
      node: "g-platform",
    });
  });

  it("drops values the API would reject", () => {
    expect(parseExplorerState({ q: "  ", kind: "robot", offset: "-5", node: "x".repeat(201) })).toEqual({});
    expect(parseExplorerState({ offset: "abc" })).toEqual({});
    expect(parseExplorerState({ q: "a".repeat(500) }).q).toHaveLength(200);
  });

  it("aligns the offset to a page", () => {
    expect(parseExplorerState({ offset: String(PAGE_SIZE + 3) }).offset).toBe(PAGE_SIZE);
    expect(parseExplorerState({ offset: "3" })).toEqual({});
  });

  it("uses the first value of repeated params", () => {
    expect(parseExplorerState({ q: ["one", "two"], kind: ["resource", "group"] })).toEqual({ q: "one", kind: "resource" });
  });
});

describe("explorerHref", () => {
  const base = explorerPath("ws 1", "snap/1");

  it("encodes the path segments", () => {
    expect(base).toBe("/workspaces/ws%201/snapshots/snap%2F1");
  });

  it("leaves out empty fields", () => {
    expect(explorerHref(base, {})).toBe(base);
    expect(explorerHref(base, { offset: 0, q: "" })).toBe(base);
  });

  it("round-trips through parseExplorerState", () => {
    const state = { q: "a&b c", kind: "principal" as const, offset: 50, node: "p-dana" };
    const href = explorerHref(base, state);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseExplorerState(params)).toEqual(state);
  });
});
