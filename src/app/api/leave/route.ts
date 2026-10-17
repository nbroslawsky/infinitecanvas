import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await getAuth();
  await auth.api.signOut({ headers: request.headers });
  return NextResponse.redirect(new URL("/not-allowed", request.url));
}
