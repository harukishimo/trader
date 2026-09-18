import {
  checkPassword,
  configured,
  sameOrigin,
  sessionValue,
} from "@/server/auth";
import { initialize } from "@/core/db";
import { rateLimit } from "@/core/service";
import { cookies } from "next/headers";
export async function POST(request: Request) {
  if (!sameOrigin(request) || !configured())
    return Response.json(
      { error: "設定を確認してください。" },
      { status: 403 },
    );
  await initialize();
  if (!(await rateLimit("login", 20, 300)))
    return Response.json(
      { error: "しばらく待ってから再試行してください。" },
      { status: 429 },
    );
  const body = await request.json();
  if (
    typeof body.password !== "string" ||
    body.password.length > 512 ||
    !checkPassword(body.password)
  )
    return Response.json(
      { error: "パスワードが一致しません。" },
      { status: 401 },
    );
  if (!process.env.SESSION_SECRET)
    return Response.json(
      { error: "SESSION_SECRETが未設定です。" },
      { status: 503 },
    );
  (await cookies()).set("trader-session", sessionValue(), {
    httpOnly: true,
    secure: !!process.env.VERCEL,
    sameSite: "strict",
    path: "/",
    maxAge: 43200,
  });
  return Response.json({ ok: true });
}
