import { PrismaClient } from "@prisma/client";
import { PrismaSnapshotStore } from "./prisma-snapshot-store.js";
import { PrismaWorkspaceStore } from "./prisma-store.js";
import { seed } from "./seed.js";
import { SEED_USERS } from "./seed-data.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; copy .env.example to apps/api/.env and start the database.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: user,
      update: { email: user.email, displayName: user.displayName },
    });
  }
  const result = await seed({ workspaces: new PrismaWorkspaceStore(prisma), snapshots: new PrismaSnapshotStore(prisma) });
  console.log(
    `Seeded ${SEED_USERS.length} users, ${result.workspacesCreated} new workspaces, ${result.snapshotsImported} new snapshots.`,
  );
} finally {
  await prisma.$disconnect();
}
