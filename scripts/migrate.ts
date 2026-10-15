import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db, transaction } from "../apps/web/src/lib/db";
try {
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(726348231)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of (await readdir("database/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(`database/migrations/${file}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const old = await c.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [file],
      );
      if (old.rowCount) {
        if (old.rows[0].checksum !== checksum)
          throw new Error(`Migration checksum changed: ${file}`);
        continue;
      }
      await c.query(sql);
      await c.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [file, checksum],
      );
      console.log(`Applied ${file}`);
    }
  });
} finally {
  await db().end();
}
