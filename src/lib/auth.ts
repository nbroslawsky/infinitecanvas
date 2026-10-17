import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { setSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { z } from "zod";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { adminEmails, devLoginEnabled } from "@/lib/access";

const devLogin = {
  id: "dev-login",
  endpoints: {
    devLogin: createAuthEndpoint(
      "/dev-login",
      {
        method: "POST",
        body: z.object({
          email: z.string().optional(),
        }),
      },
      async (ctx) => {
        if (!devLoginEnabled()) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
        const email = (ctx.body.email || adminEmails()[0] || "dev@localhost").toLowerCase();
        const existing = await ctx.context.internalAdapter.findUserByEmail(email);
        let user = existing?.user;
        if (!user) {
          try {
            user = await ctx.context.internalAdapter.createUser(
              {
                email,
                name: email.split("@")[0] || "Dev",
                emailVerified: true,
              },
              { method: "admin" },
            );
          } catch {
            const again = await ctx.context.internalAdapter.findUserByEmail(email);
            if (!again?.user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not sign in" });
            user = again.user;
          }
        }
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ ok: true, email: user.email });
      },
    ),
  },
} satisfies BetterAuthPlugin;

const globalAuth = globalThis as unknown as {
  canvasAuth?: ReturnType<typeof buildAuth>;
  canvasAuthKey?: string;
};

async function buildAuth() {
  const db = await getDb();
  const plugins: BetterAuthPlugin[] = [];
  if (devLoginEnabled()) plugins.push(devLogin);
  plugins.push(nextCookies());
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secret =
    process.env.BETTER_AUTH_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "dev-only-secret-not-for-production-use");
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }
  return betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    socialProviders:
      googleId && googleSecret
        ? {
            google: {
              clientId: googleId,
              clientSecret: googleSecret,
              prompt: "select_account",
            },
          }
        : undefined,
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
    },
    trustedOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3456",
      "http://127.0.0.1:3456",
    ],
    plugins,
  });
}

export function getAuth() {
  const key = [
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.BETTER_AUTH_URL || "",
    process.env.DATABASE_URL || "",
  ].join("|");
  if (!globalAuth.canvasAuth || globalAuth.canvasAuthKey !== key) {
    globalAuth.canvasAuthKey = key;
    globalAuth.canvasAuth = buildAuth();
  }
  return globalAuth.canvasAuth;
}
