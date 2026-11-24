export default function NotFound() {
  return (
    <div className="panel">
      <h1>Not found</h1>
      <p>This workspace or snapshot does not exist, or you are not a member of the workspace.</p>
      <p>
        <a href="/">Back to workspaces</a>
      </p>
    </div>
  );
}
