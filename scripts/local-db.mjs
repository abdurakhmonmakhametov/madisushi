// Local development database: a real PostgreSQL 17 cluster from the
// `embedded-postgres` package (no Docker needed). Keep this process running
// while you use `npm run dev`. Data lives in ./.data/pg.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";

const port = Number(process.env.LOCAL_PG_PORT || 54329);
const dir = new URL("../.data/pg", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const fresh = !fs.existsSync(`${dir}/PG_VERSION`);

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
// Always UTF-8 regardless of the Windows code page.
const admin = pg.getPgClient();
await admin.connect();
const exists = (await admin.query("select 1 from pg_database where datname = 'sushi'")).rowCount;
if (!exists) await admin.query("create database sushi encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0");
await admin.end();
console.log(`[local-db] PostgreSQL ready: postgres://postgres:postgres@127.0.0.1:${port}/sushi`);
console.log("[local-db] Press Ctrl+C to stop.");

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
