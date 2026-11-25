import { describe, expect, it } from "vitest";
import { accessHref, accessPath, parseAccessState } from "../src/lib/access-url";

describe("parseAccessState", () => {
  it("reads subject, resource and permission", () => {
    expect(parseAccessState({ subject: " p-contractor ", resource: "repo-web", permission: "write" })).toEqual({
      subject: "p-contractor",
      resource: "repo-web",
      permission: "write",
    });
  });

  it("drops values the API would reject", () => {
    expect(parseAccessState({ subject: "  ", resource: "x".repeat(201), permission: "owner" })).toEqual({});
    expect(parseAccessState({ permission: "" })).toEqual({});
  });

  it("uses the first of repeated parameters", () => {
    expect(parseAccessState({ subject: ["a", "b"], permission: ["read", "admin"] })).toEqual({ subject: "a", permission: "read" });
  });
});

describe("accessHref", () => {
  const base = accessPath("w 1", "s/1");

  it("encodes the snapshot path", () => {
    expect(base).toBe("/workspaces/w%201/snapshots/s%2F1/access");
  });

  it("leaves out empty fields and round-trips through the parser", () => {
    expect(accessHref(base, {})).toBe(base);
    const state = { subject: "g-contractors", resource: "repo:web", permission: "admin" as const };
    const href = accessHref(base, state);
    expect(href).toBe(`${base}?subject=g-contractors&resource=repo%3Aweb&permission=admin`);
    expect(parseAccessState(Object.fromEntries(new URL(href, "http://x").searchParams))).toEqual(state);
  });
});
