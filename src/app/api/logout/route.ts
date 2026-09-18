import { cookies } from "next/headers";
import { sameOrigin } from "@/server/auth";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  (await cookies()).delete("trader-session");
  return Response.json({ ok: true });
}
