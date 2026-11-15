import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { DEFAULT_DB_PATH, openDb } from "./db/client.ts";

const { host, port } = readConfig();
const db = openDb();

const server = serve({ fetch: createApp({ db }).fetch, hostname: host, port }, (info) => {
  console.log(
    `API listening on http://${host}:${info.port} (GET /health, /attempts, /leaderboard/:missionId; POST /attempts, /flight-director, /agents/designer, /agents/monitor)`,
  );
  console.log(`SQLite database: ${process.env.DB_PATH ?? DEFAULT_DB_PATH}`);
});

function shutdown(): void {
  server.close();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
