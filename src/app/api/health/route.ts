import { initialize, query } from "@/core/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await initialize();
    await query("SELECT 1");
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "configuration_required" }, { status: 503 });
  }
}
