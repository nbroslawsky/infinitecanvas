import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { ensureSchema } from "@/db/ensure";

type Database = ReturnType<typeof drizzleNeon<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

const globalDb = globalThis as unknown as { canvasDb?: Promise<Database> };

function createDb(): Database {
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    return drizzleNeon(sql, { schema });
  }
  const dir = process.env.DATA_DIR || ".data/pglite";
  const client = new PGlite(dir);
  return drizzlePglite(client, { schema });
}

export function getDb() {
  if (!globalDb.canvasDb) {
    globalDb.canvasDb = (async () => {
      const db = createDb();
      await ensureSchema(db);
      return db;
    })();
  }
  return globalDb.canvasDb;
}
