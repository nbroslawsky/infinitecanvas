import { sql } from "drizzle-orm";

const statements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    id text PRIMARY KEY,
    "expiresAt" timestamptz NOT NULL,
    token text NOT NULL UNIQUE,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    id text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    scope text,
    password text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "allowed_email" (
    email text PRIMARY KEY,
    "addedBy" text,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "board" (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name text NOT NULL,
    "cameraX" double precision NOT NULL DEFAULT 0,
    "cameraY" double precision NOT NULL DEFAULT 0,
    zoom double precision NOT NULL DEFAULT 1,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "asset" (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "originalUrl" text NOT NULL,
    "previewUrl" text NOT NULL,
    mime text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "item" (
    id text PRIMARY KEY,
    "boardId" text NOT NULL REFERENCES "board"(id) ON DELETE CASCADE,
    type text NOT NULL,
    "assetId" text REFERENCES "asset"(id) ON DELETE SET NULL,
    "parentId" text,
    x double precision NOT NULL,
    y double precision NOT NULL,
    width double precision NOT NULL,
    height double precision NOT NULL,
    rotation double precision NOT NULL DEFAULT 0,
    "zIndex" integer NOT NULL DEFAULT 0,
    text text,
    "fontSize" integer,
    color text,
    name text
  )`,
];

export async function ensureSchema(db: { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }) {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}
