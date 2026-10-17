import { NextResponse } from "next/server";
import { getViewer } from "@/lib/session";

export async function requireUser() {
  const viewer = await getViewer();
  if (!viewer?.allowed) return null;
  return viewer;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
