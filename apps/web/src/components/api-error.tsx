import { ApiError } from "../lib/api";

/** Explains a failed API call; in development the usual cause is a stopped API. */
export function ApiErrorPanel({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : undefined;
  return (
    <div className="panel panel-error" role="alert">
      <h2>Could not load data</h2>
      <p>
        {apiError ? (
          <>
            <code>{apiError.code}</code> {apiError.message}
          </>
        ) : (
          "Unexpected error while calling the API."
        )}
      </p>
      {apiError?.code === "API_UNREACHABLE" && (
        <p className="muted">
          Start the API with <code>pnpm --filter @permitgraph/api dev</code> or set <code>PERMITGRAPH_API_URL</code>.
        </p>
      )}
      {apiError?.status === 401 && (
        <p className="muted">
          Set <code>PERMITGRAPH_USER</code> to the id of a seeded user, such as <code>u-vera</code>.
        </p>
      )}
    </div>
  );
}
