/**
 * Database CLI.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:status           list applied / pending migrations
 *   npm run db:new -- add_x     create db/migrations/NNNN_add_x.sql
 *
 * Reads DATABASE_URL_UNPOOLED or DATABASE_URL (from the environment or .env.local).
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMigrations, migrate, MigrationError, nextFilename, status } from "../db/migrator.ts";
import { connect, migrationUrl } from "../db/pg.ts";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");

const SYMBOL = { applied: "✓", pending: "·", changed: "✗", missing: "?" } as const;

async function main(command: string | undefined, args: string[]): Promise<number> {
  const migrations = await loadMigrations(MIGRATIONS_DIR);

  if (command === "new") {
    const filename = nextFilename(migrations, args.join(" "));
    const file = path.join(MIGRATIONS_DIR, filename);
    await writeFile(file, `-- ${args.join(" ")}\n\n`, { flag: "wx" });
    console.log(`Created db/migrations/${filename}`);
    return 0;
  }

  if (command !== "migrate" && command !== "status") {
    console.error("Usage: db.ts <migrate | status | new <name>>");
    return 2;
  }

  const db = await connect(migrationUrl());
  try {
    if (command === "migrate") {
      await migrate(db, migrations, { log: (l) => console.log(l) });
      return 0;
    }
    const entries = await status(db, migrations);
    for (const e of entries) {
      const when = e.appliedAt ? `  ${e.appliedAt.toISOString()}` : "";
      console.log(
        `${SYMBOL[e.state]} ${String(e.id).padStart(4, "0")}_${e.name}  ${e.state}${when}`,
      );
    }
    const bad = entries.some((e) => e.state === "changed" || e.state === "missing");
    return bad ? 1 : 0;
  } finally {
    await db.close();
  }
}

main(process.argv[2], process.argv.slice(3)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof MigrationError || err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
