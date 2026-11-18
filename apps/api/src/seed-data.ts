import type { GraphSnapshot } from "@permitgraph/evaluator";
import type { User, WorkspaceRole } from "./domain.js";

/**
 * Synthetic demo data. Every name, email and id is made up; nothing here
 * comes from a real organisation.
 */
export const SEED_USERS: readonly User[] = [
  { id: "u-olivia", email: "olivia@example.test", displayName: "Olivia Owner" },
  { id: "u-eddie", email: "eddie@example.test", displayName: "Eddie Editor" },
  { id: "u-vera", email: "vera@example.test", displayName: "Vera Viewer" },
  { id: "u-oscar", email: "oscar@example.test", displayName: "Oscar Owner" },
];

/**
 * Acme: platform team with a nested contractors group.
 *
 *   p-dana       ──▶ g-platform ──▶ g-engineering
 *   p-lee        ──▶ g-engineering
 *   p-contractor ──▶ g-contractors ──▶ g-platform
 *   svc-deploy   ──▶ g-automation
 */
const acmeGraph: GraphSnapshot = {
  principals: [
    { id: "p-dana", kind: "user", displayName: "Dana Example" },
    { id: "p-lee", kind: "user", displayName: "Lee Example" },
    { id: "p-contractor", kind: "user", displayName: "Casey Contractor" },
    { id: "svc-deploy", kind: "service", displayName: "Deploy bot" },
  ],
  groups: [
    { id: "g-engineering", displayName: "Engineering" },
    { id: "g-platform", displayName: "Platform" },
    { id: "g-contractors", displayName: "Contractors" },
    { id: "g-automation", displayName: "Automation" },
  ],
  memberships: [
    { member: "p-dana", group: "g-platform" },
    { member: "g-platform", group: "g-engineering" },
    { member: "p-lee", group: "g-engineering" },
    { member: "p-contractor", group: "g-contractors" },
    { member: "g-contractors", group: "g-platform" },
    { member: "svc-deploy", group: "g-automation" },
  ],
  resources: [
    { id: "repo-api", kind: "repository", displayName: "acme/api" },
    { id: "repo-infra", kind: "repository", displayName: "acme/infra" },
    { id: "repo-web", kind: "repository", displayName: "acme/web" },
  ],
};

/**
 * Globex reuses some of Acme's ids (`g-engineering`, `repo-api`) on purpose:
 * ids only have to be unique inside one snapshot, and the two workspaces must
 * never see each other's nodes.
 */
const globexGraph: GraphSnapshot = {
  principals: [
    { id: "p-hana", kind: "user", displayName: "Hana Example" },
    { id: "p-ravi", kind: "user", displayName: "Ravi Example" },
  ],
  groups: [
    { id: "g-engineering", displayName: "Engineering" },
    { id: "g-oncall", displayName: "On-call" },
  ],
  memberships: [
    { member: "p-hana", group: "g-engineering" },
    { member: "p-ravi", group: "g-oncall" },
    { member: "g-oncall", group: "g-engineering" },
  ],
  resources: [{ id: "repo-api", kind: "repository", displayName: "globex/api" }],
};

export interface SeedWorkspace {
  slug: string;
  name: string;
  ownerId: string;
  members: readonly { userId: string; role: WorkspaceRole }[];
  snapshots: readonly { label: string; graph: GraphSnapshot }[];
}

export const SEED_WORKSPACES: readonly SeedWorkspace[] = [
  {
    slug: "acme",
    name: "Acme (synthetic)",
    ownerId: "u-olivia",
    members: [
      { userId: "u-eddie", role: "EDITOR" },
      { userId: "u-vera", role: "VIEWER" },
    ],
    snapshots: [{ label: "acme baseline", graph: acmeGraph }],
  },
  {
    slug: "globex",
    name: "Globex (synthetic)",
    ownerId: "u-oscar",
    members: [],
    snapshots: [{ label: "globex baseline", graph: globexGraph }],
  },
];
