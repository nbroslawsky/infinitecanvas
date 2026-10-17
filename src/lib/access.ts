import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { allowedEmails } from "@/db/schema";

export function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function adminEmails(): string[] {
  const configured = parseEmailList(process.env.ADMIN_EMAILS);
  if (configured.length === 0 && process.env.NODE_ENV !== "production") {
    return ["dev@localhost"];
  }
  return configured;
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

export function peopleToolsConfigured(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return parseEmailList(process.env.ADMIN_EMAILS).length > 0;
}

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.GOOGLE_CLIENT_ID;
}

export async function isAllowedEmail(email: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  if (isAdminEmail(normalized)) return true;
  const db = await getDb();
  const rows = await db.select().from(allowedEmails).where(eq(allowedEmails.email, normalized)).limit(1);
  return rows.length > 0;
}
