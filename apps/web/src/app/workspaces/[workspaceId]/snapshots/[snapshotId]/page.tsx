import { notFound } from "next/navigation";
import { ApiErrorPanel } from "../../../../../components/api-error";
import { KindBadge, MatchBadge } from "../../../../../components/badges";
import { NeighbourhoodGraph } from "../../../../../components/neighbourhood-graph";
import { NodeDetails } from "../../../../../components/node-details";
import { accessHref, accessPath } from "../../../../../lib/access-url";
import { ApiError, apiConfig, createApiClient } from "../../../../../lib/api";
import { PAGE_SIZE, explorerHref, explorerPath, parseExplorerState } from "../../../../../lib/explorer-url";
import { layoutNeighbourhood } from "../../../../../lib/neighbourhood-layout";
import type { NodeNeighbourhood, NodeSearchResult, SnapshotSummary, Workspace } from "../../../../../lib/types";

interface Props {
  params: Promise<{ workspaceId: string; snapshotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KIND_OPTIONS = [
  { value: "", label: "All kinds" },
  { value: "principal", label: "Principals" },
  { value: "group", label: "Groups" },
  { value: "resource", label: "Resources" },
] as const;

/** Graph explorer for one snapshot: search on the left, the selected node and its edges on the right. */
export default async function ExplorerPage({ params, searchParams }: Props) {
  const { workspaceId, snapshotId } = await params;
  const state = parseExplorerState(await searchParams);
  const base = explorerPath(workspaceId, snapshotId);
  const api = createApiClient(apiConfig());

  let workspace: Workspace;
  let snapshot: SnapshotSummary | undefined;
  let results: NodeSearchResult;
  try {
    const [ws, snapshots, found] = await Promise.all([
      api.getWorkspace(workspaceId),
      api.listSnapshots(workspaceId),
      api.searchNodes(workspaceId, snapshotId, {
        ...(state.q ? { q: state.q } : {}),
        ...(state.kind ? { kind: state.kind } : {}),
        limit: PAGE_SIZE,
        offset: state.offset ?? 0,
      }),
    ]);
    workspace = ws;
    snapshot = snapshots.find((s) => s.id === snapshotId);
    results = found;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ApiErrorPanel error={error} />;
  }
  if (!snapshot) notFound();

  let selected: NodeNeighbourhood | undefined;
  let selectedError: unknown;
  if (state.node) {
    try {
      selected = await api.getNode(workspaceId, snapshotId, state.node);
    } catch (error) {
      selectedError = error;
    }
  }

  const select = (nodeId: string) => explorerHref(base, { ...state, node: nodeId });
  const page = (offset: number) => explorerHref(base, { ...state, offset });
  const offset = results.offset;
  const inspector = accessPath(workspaceId, snapshotId);

  return (
    <>
      <p className="crumbs">
        <a href="/">Workspaces</a> / <a href={`/workspaces/${encodeURIComponent(workspace.id)}`}>{workspace.name}</a> /
      </p>
      <h1>{snapshot.label || snapshot.id}</h1>
      <p className="muted">
        {snapshot.counts.principals} principals · {snapshot.counts.groups} groups · {snapshot.counts.resources} resources ·{" "}
        {snapshot.counts.memberships} memberships · {snapshot.counts.grants} grants ·{" "}
        <a href={inspector}>Trace access paths</a>
      </p>

      <div className="explorer">
        <aside className="panel">
          <form method="get" action={base} className="search" role="search">
            <input type="search" name="q" defaultValue={state.q ?? ""} placeholder="Search by name or id" aria-label="Search nodes" />
            <select name="kind" defaultValue={state.kind ?? ""} aria-label="Kind">
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {state.node && <input type="hidden" name="node" value={state.node} />}
            <button type="submit">Search</button>
          </form>

          <p className="muted" data-testid="result-count">
            {results.total === 0
              ? "No matching nodes."
              : `${offset + 1}–${offset + results.nodes.length} of ${results.total}`}
          </p>
          <ul className="results">
            {results.nodes.map((n) => (
              <li key={n.id} className={n.id === state.node ? "active" : undefined}>
                <a href={select(n.id)}>
                  <span className="label">{n.label}</span>
                  <span className="muted id">{n.id}</span>
                </a>
                <KindBadge node={n} />
                <MatchBadge match={n.match} />
              </li>
            ))}
          </ul>
          {(offset > 0 || offset + results.nodes.length < results.total) && (
            <nav className="pager" aria-label="Result pages">
              {offset > 0 ? <a href={page(Math.max(0, offset - PAGE_SIZE))}>← Previous</a> : <span />}
              {offset + results.nodes.length < results.total && <a href={page(offset + PAGE_SIZE)}>Next →</a>}
            </nav>
          )}
        </aside>

        <section className="panel detail" aria-live="polite">
          {selected ? (
            <>
              <h2>
                {selected.node.label} <KindBadge node={selected.node} />
              </h2>
              <p className="muted">
                <code>{selected.node.id}</code> ·{" "}
                <a
                  href={accessHref(
                    inspector,
                    selected.node.kind === "resource" ? { resource: selected.node.id } : { subject: selected.node.id },
                  )}
                >
                  {selected.node.kind === "resource" ? "Trace who can reach it" : "Trace its access"}
                </a>
              </p>
              <NeighbourhoodGraph layout={layoutNeighbourhood(selected)} hrefFor={select} />
              <NodeDetails data={selected} hrefFor={select} />
            </>
          ) : selectedError instanceof ApiError && selectedError.status === 404 ? (
            <p role="alert">
              Node <code>{state.node}</code> is not in this snapshot.
            </p>
          ) : selectedError ? (
            <ApiErrorPanel error={selectedError} />
          ) : (
            <p className="muted">Select a node to see its memberships and grants.</p>
          )}
        </section>
      </div>
    </>
  );
}
