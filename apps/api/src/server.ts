import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { PrismaWorkspaceStore } from "./prisma-store.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; copy .env.example to .env and start the database.");
  process.exit(1);
}

const prisma = new PrismaClient();
const app = buildApp({ store: new PrismaWorkspaceStore(prisma), logger: true });

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
