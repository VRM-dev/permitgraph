-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "principal_count" INTEGER NOT NULL,
    "group_count" INTEGER NOT NULL,
    "membership_count" INTEGER NOT NULL,
    "resource_count" INTEGER NOT NULL,
    "imported_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshots_workspace_id_created_at_idx" ON "snapshots"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "snapshots_workspace_id_content_hash_idx" ON "snapshots"("workspace_id", "content_hash");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshots are immutable: reject every UPDATE. Rows can still go away when
-- their workspace is deleted (ON DELETE CASCADE above).
CREATE FUNCTION "reject_snapshot_update"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'snapshots are immutable (id %)', OLD."id" USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "snapshots_immutable"
    BEFORE UPDATE ON "snapshots"
    FOR EACH ROW EXECUTE FUNCTION "reject_snapshot_update"();
