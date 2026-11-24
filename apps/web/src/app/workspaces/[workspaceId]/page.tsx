import { notFound } from "next/navigation";
import { ApiErrorPanel } from "../../../components/api-error";
import { ApiError, apiConfig, createApiClient } from "../../../lib/api";
import { explorerPath } from "../../../lib/explorer-url";
import type { SnapshotSummary, Workspace } from "../../../lib/types";

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspacePage({ params }: Props) {
  const { workspaceId } = await params;
  const api = createApiClient(apiConfig());

  let workspace: Workspace;
  let snapshots: SnapshotSummary[];
  try {
    [workspace, snapshots] = await Promise.all([api.getWorkspace(workspaceId), api.listSnapshots(workspaceId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ApiErrorPanel error={error} />;
  }

  return (
    <>
      <p className="crumbs">
        <a href="/">Workspaces</a> /
      </p>
      <h1>{workspace.name}</h1>
      <h2>Snapshots</h2>
      {snapshots.length === 0 ? (
        <p className="muted">No snapshots imported yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Snapshot</th>
              <th>Imported</th>
              <th className="num">Principals</th>
              <th className="num">Groups</th>
              <th className="num">Resources</th>
              <th className="num">Memberships</th>
              <th className="num">Grants</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={explorerPath(workspace.id, s.id)}>{s.label || s.id}</a>
                </td>
                <td>
                  <time dateTime={s.createdAt}>{s.createdAt.slice(0, 16).replace("T", " ")} UTC</time>
                </td>
                <td className="num">{s.counts.principals}</td>
                <td className="num">{s.counts.groups}</td>
                <td className="num">{s.counts.resources}</td>
                <td className="num">{s.counts.memberships}</td>
                <td className="num">{s.counts.grants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
