import type { Grant, GraphSnapshot, MembershipEdge, Principal } from "../../src/index.js";

/**
 * Synthetic 40-identity organisation (34 users, 6 service accounts) used to
 * check that a realistically sized snapshot loads the same way every time.
 * Every name is made up. The layout is fixed, not random.
 *
 *   g-all-staff ◀── g-engineering ◀── g-platform, g-frontend, g-contractors
 *               ◀── g-security, g-finance, g-support
 *   g-automation (service accounts only)
 *
 * Grants worth noting for later demos:
 *   - g-contractors has write on repo-web, so contractors reach it only
 *     through that group.
 *   - u-contractor-01 also holds a direct write grant on repo-docs, so
 *     removing them from g-contractors keeps that access.
 */

const TEAMS: ReadonlyArray<{ group: string; prefix: string; size: number }> = [
  { group: "g-platform", prefix: "u-platform", size: 8 },
  { group: "g-frontend", prefix: "u-frontend", size: 7 },
  { group: "g-contractors", prefix: "u-contractor", size: 5 },
  { group: "g-security", prefix: "u-security", size: 4 },
  { group: "g-finance", prefix: "u-finance", size: 5 },
  { group: "g-support", prefix: "u-support", size: 4 },
];

const SERVICES = ["svc-ci", "svc-deploy", "svc-backup", "svc-metrics", "svc-docs-bot", "svc-release"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function title(prefix: string, n: number): string {
  const team = prefix.slice(2);
  return `${team.charAt(0).toUpperCase()}${team.slice(1)} Person ${pad(n)}`;
}

function build(): GraphSnapshot {
  const principals: Principal[] = [];
  const memberships: MembershipEdge[] = [];

  for (const team of TEAMS) {
    for (let i = 1; i <= team.size; i += 1) {
      const id = `${team.prefix}-${pad(i)}`;
      principals.push({ id, kind: "user", displayName: title(team.prefix, i) });
      memberships.push({ member: id, group: team.group });
    }
  }
  principals.push({ id: "u-ceo", kind: "user", displayName: "Morgan Example" });
  memberships.push({ member: "u-ceo", group: "g-all-staff" });

  for (const id of SERVICES) {
    principals.push({ id, kind: "service", displayName: id.replace("svc-", "") + " service" });
    memberships.push({ member: id, group: "g-automation" });
  }

  memberships.push(
    { member: "g-platform", group: "g-engineering" },
    { member: "g-frontend", group: "g-engineering" },
    { member: "g-contractors", group: "g-engineering" },
    { member: "g-engineering", group: "g-all-staff" },
    { member: "g-security", group: "g-all-staff" },
    { member: "g-finance", group: "g-all-staff" },
    { member: "g-support", group: "g-all-staff" },
    // A platform engineer also on the security rota.
    { member: "u-platform-01", group: "g-security" },
  );

  const grants: Grant[] = [
    { subject: "g-all-staff", resource: "repo-handbook", permission: "read" },
    { subject: "g-engineering", resource: "repo-api", permission: "read" },
    { subject: "g-engineering", resource: "repo-web", permission: "read" },
    { subject: "g-platform", resource: "repo-api", permission: "write" },
    { subject: "g-platform", resource: "repo-infra", permission: "write" },
    { subject: "g-frontend", resource: "repo-web", permission: "write" },
    { subject: "g-contractors", resource: "repo-web", permission: "write" },
    { subject: "u-contractor-01", resource: "repo-docs", permission: "write" },
    { subject: "g-engineering", resource: "repo-docs", permission: "read" },
    { subject: "g-security", resource: "repo-infra", permission: "admin" },
    { subject: "g-finance", resource: "repo-ledger", permission: "write" },
    { subject: "g-support", resource: "repo-handbook", permission: "write" },
    { subject: "g-automation", resource: "repo-api", permission: "read" },
    { subject: "svc-deploy", resource: "repo-infra", permission: "write" },
    { subject: "svc-release", resource: "repo-api", permission: "admin" },
    { subject: "svc-docs-bot", resource: "repo-docs", permission: "write" },
    { subject: "u-ceo", resource: "repo-ledger", permission: "read" },
  ];

  return {
    principals,
    groups: [
      { id: "g-all-staff", displayName: "All staff" },
      { id: "g-engineering", displayName: "Engineering" },
      { id: "g-platform", displayName: "Platform" },
      { id: "g-frontend", displayName: "Frontend" },
      { id: "g-contractors", displayName: "Contractors" },
      { id: "g-security", displayName: "Security" },
      { id: "g-finance", displayName: "Finance" },
      { id: "g-support", displayName: "Support" },
      { id: "g-automation", displayName: "Automation" },
    ],
    memberships,
    resources: [
      { id: "repo-api", kind: "repository", displayName: "example/api" },
      { id: "repo-web", kind: "repository", displayName: "example/web" },
      { id: "repo-infra", kind: "repository", displayName: "example/infra" },
      { id: "repo-docs", kind: "repository", displayName: "example/docs" },
      { id: "repo-ledger", kind: "repository", displayName: "example/ledger" },
      { id: "repo-handbook", kind: "repository", displayName: "example/handbook" },
    ],
    grants,
  };
}

export const sampleOrg: GraphSnapshot = build();

/**
 * Deterministic reordering (a fixed-seed shuffle) so tests can feed the same
 * graph in a different order without using Math.random.
 */
export function reorder<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
