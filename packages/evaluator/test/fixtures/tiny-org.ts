import type { GraphSnapshot } from "../../src/index.js";

/**
 * Smallest useful synthetic organisation. All names are made up.
 *
 *   u-alice      ──▶ g-engineering
 *   u-contractor ──▶ g-contractors ──▶ g-engineering
 *   svc-ci       ──▶ g-automation
 *   u-bob        (no memberships)
 */
export const tinyOrg: GraphSnapshot = {
  principals: [
    { id: "u-alice", kind: "user", displayName: "Alice Example" },
    { id: "u-bob", kind: "user", displayName: "Bob Example" },
    { id: "u-contractor", kind: "user", displayName: "Casey Contractor" },
    { id: "svc-ci", kind: "service", displayName: "CI runner" },
  ],
  groups: [
    { id: "g-engineering", displayName: "Engineering" },
    { id: "g-contractors", displayName: "Contractors" },
    { id: "g-automation", displayName: "Automation" },
  ],
  memberships: [
    { member: "u-alice", group: "g-engineering" },
    { member: "u-contractor", group: "g-contractors" },
    { member: "g-contractors", group: "g-engineering" },
    { member: "svc-ci", group: "g-automation" },
  ],
  resources: [
    { id: "repo-api", kind: "repository", displayName: "acme/api" },
    { id: "repo-web", kind: "repository", displayName: "acme/web" },
  ],
};

/** Copy of the fixture with one membership edge left out. */
export function withoutEdge(snapshot: GraphSnapshot, member: string, group: string): GraphSnapshot {
  return {
    ...snapshot,
    memberships: snapshot.memberships.filter((e) => !(e.member === member && e.group === group)),
  };
}
