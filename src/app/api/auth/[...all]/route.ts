import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

async function handle(request: Request) {
  const auth = await getAuth();
  const handlers = toNextJsHandler(auth);
  if (request.method === "POST") return handlers.POST(request);
  return handlers.GET(request);
}

export const GET = handle;
export const POST = handle;
