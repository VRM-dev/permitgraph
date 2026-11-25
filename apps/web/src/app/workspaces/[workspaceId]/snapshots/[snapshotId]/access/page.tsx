import { notFound } from "next/navigation";
import { AccessPaths } from "../../../../../../components/access-paths";
import { ApiErrorPanel } from "../../../../../../components/api-error";
import { accessHref, accessPath, parseAccessState } from "../../../../../../lib/access-url";
import { ApiError, apiConfig, createApiClient } from "../../../../../../lib/api";
import { explorerHref, explorerPath } from "../../../../../../lib/explorer-url";
import { PERMISSIONS } from "../../../../../../lib/types";
import type { AccessExplanation, NodeHit, SnapshotSummary, Workspace } from "../../../../../../lib/types";

interface Props {
  params: Promise<{ workspaceId: string; snapshotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Resources offered as suggestions in the form; any id can still be typed. */
const RESOURCE_SUGGESTIONS = 100;

/** Access-path inspector: how a principal or group reaches a resource, path by path. */
export default async function AccessPage({ params, searchParams }: Props) {
  const { workspaceId, snapshotId } = await params;
  const state = parseAccessState(await searchParams);
  const base = accessPath(workspaceId, snapshotId);
  const explorer = explorerPath(workspaceId, snapshotId);
  const api = createApiClient(apiConfig());

  let workspace: Workspace;
  let snapshot: SnapshotSummary | undefined;
  let resources: NodeHit[];
  try {
    const [ws, snapshots, found] = await Promise.all([
      api.getWorkspace(workspaceId),
      api.listSnapshots(workspaceId),
      api.searchNodes(workspaceId, snapshotId, { kind: "resource", limit: RESOURCE_SUGGESTIONS }),
    ]);
    workspace = ws;
    snapshot = snapshots.find((s) => s.id === snapshotId);
    resources = found.nodes;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ApiErrorPanel error={error} />;
  }
  if (!snapshot) notFound();

  let result: AccessExplanation | undefined;
  let resultError: unknown;
  if (state.subject && state.resource) {
    try {
      result = await api.explainAccess(workspaceId, snapshotId, {
        subject: state.subject,
        resource: state.resource,
        ...(state.permission ? { permission: state.permission } : {}),
      });
    } catch (error) {
      resultError = error;
    }
  }

  const nodeHref = (nodeId: string) => explorerHref(explorer, { node: nodeId });
  const unknownSide =
    resultError instanceof ApiError && resultError.status === 404
      ? resultError.code === "UNKNOWN_SUBJECT"
        ? `Subject ${state.subject} is not a principal or group in this snapshot.`
        : resultError.code === "UNKNOWN_RESOURCE"
          ? `Resource ${state.resource} is not in this snapshot.`
          : undefined
      : undefined;

  return (
    <>
      <p className="crumbs">
        <a href="/">Workspaces</a> / <a href={`/workspaces/${encodeURIComponent(workspace.id)}`}>{workspace.name}</a> /{" "}
        <a href={explorer}>{snapshot.label || snapshot.id}</a> /
      </p>
      <h1>Access paths</h1>
      <p className="muted">
        Trace how a user, service or group reaches a resource: every chain of group memberships that ends in a grant.
      </p>

      <form method="get" action={base} className="panel access-form" role="search">
        <label>
          Subject
          <input name="subject" defaultValue={state.subject ?? ""} placeholder="e.g. p-contractor or g-platform" required />
        </label>
        <label>
          Resource
          <input name="resource" defaultValue={state.resource ?? ""} list="resource-ids" placeholder="e.g. repo-web" required />
          <datalist id="resource-ids">
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          At least
          <select name="permission" defaultValue={state.permission ?? ""}>
            <option value="">any access</option>
            {PERMISSIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Trace</button>
      </form>

      <section className="panel access-panel" aria-live="polite">
        {result ? (
          <>
            <h2>
              <a href={nodeHref(result.subject.id)}>{result.subject.label}</a> → <a href={nodeHref(result.resource.id)}>{result.resource.label}</a>
            </h2>
            <AccessPaths result={result} hrefFor={nodeHref} />
            {result.permission && (
              <p>
                <a href={accessHref(base, { subject: result.subject.id, resource: result.resource.id })}>Show paths for any permission</a>
              </p>
            )}
          </>
        ) : unknownSide ? (
          <p role="alert">{unknownSide}</p>
        ) : resultError ? (
          <ApiErrorPanel error={resultError} />
        ) : (
          <p className="muted">Enter a subject and a resource to trace access.</p>
        )}
      </section>
    </>
  );
}
