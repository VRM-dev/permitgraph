-- Snapshots now carry grants. Existing rows were imported before grants
-- existed, so 0 is their true count. Adding a column does not fire the
-- UPDATE trigger, so the rows stay untouched otherwise.
ALTER TABLE "snapshots" ADD COLUMN "grant_count" INTEGER NOT NULL DEFAULT 0;
