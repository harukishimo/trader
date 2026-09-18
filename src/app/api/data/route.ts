import { authorized } from "@/server/auth";
import { bootstrap } from "@/core/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await authorized()))
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  try {
    return Response.json(await bootstrap(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "データを取得できません。DB接続を確認してください。" },
      { status: 503 },
    );
  }
}
