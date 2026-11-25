import { ApiErrorPanel } from "../components/api-error";
import { apiConfig, createApiClient } from "../lib/api";
import type { Workspace } from "../lib/types";

export default async function WorkspacesPage() {
  let workspaces: Workspace[];
  try {
    workspaces = await createApiClient(apiConfig()).listWorkspaces();
  } catch (error) {
    return <ApiErrorPanel error={error} />;
  }

  return (
    <>
      <h1>Workspaces</h1>
      {workspaces.length === 0 ? (
        <p className="muted">You are not a member of any workspace yet.</p>
      ) : (
        <ul className="cards">
          {workspaces.map((w) => (
            <li key={w.id} className="card">
              <a href={`/workspaces/${encodeURIComponent(w.id)}`}>{w.name}</a>
              <span className="muted">
                {w.slug}
                {w.role && <> · {w.role.toLowerCase()}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
