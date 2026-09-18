import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorized, sameOrigin } from "@/server/auth";
import { ensureData, rateLimit } from "@/core/service";
import { db, query } from "@/core/db";
import {
  enqueue,
  requestEvaluation,
  runJobs,
  scheduleDaily,
} from "@/core/jobs";
import { importCsv, recordCorporateAction } from "@/core/market";
import { createAccounts } from "@/core/paper";
const id = z.string().min(1).max(120);
const decimal = (min: number, max: number) =>
  z
    .string()
    .refine(
      (s) => /^\d+(\.\d+)?$/.test(s) && Number(s) >= min && Number(s) <= max,
    );
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("watch"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("refresh"), id: id.optional() }),
  z.object({ action: z.literal("master") }),
  z.object({
    action: z.literal("corporateAction"),
    id,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
      ),
    kind: z.enum(["split", "dividend"]),
    details: z.string().min(1).max(1000),
  }),
  z.object({ action: z.literal("deleteCorporateAction"), id }),
  z.object({
    action: z.literal("evaluate"),
    id,
    document: z.string().min(10).max(24000),
    sourceUrl: z
      .union([
        z
          .string()
          .url()
          .refine((s) => s.startsWith("https://")),
        z.literal(""),
      ])
      .optional(),
    permission: z.boolean(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("csv"),
    name: z.string().min(1).max(80),
    text: z.string().max(1000000),
  }),
  z.object({
    action: z.literal("alert"),
    id,
    type: z.enum(["above", "below", "positive"]),
    threshold: decimal(0, 100000000),
  }),
  z.object({ action: z.literal("deleteAlert"), id }),
  z.object({ action: z.literal("readAlert"), id }),
  z.object({
    action: z.literal("paper"),
    name: z.string().min(1).max(60),
    cash: decimal(10000, 1000000000),
    allocation: decimal(0.01, 0.5),
    stopLoss: decimal(0.1, 50),
    fee: decimal(0, 100),
    slippage: decimal(0, 500),
    origin: z.enum(["demo", "csv", "jquants"]),
  }),
  z.object({
    action: z.literal("paperState"),
    id,
    state: z.enum(["active", "paused"]),
  }),
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("retry"), id }),
]);
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await authorized()))
    return Response.json(
      { error: "アクセスが許可されていません。" },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length")) > 1100000)
    return Response.json({ error: "入力が大きすぎます。" }, { status: 413 });
  try {
    await ensureData();
    if (!(await rateLimit("actions", 60, 60)))
      return Response.json(
        { error: "操作が多すぎます。しばらくお待ちください。" },
        { status: 429 },
      );
    const raw = await request.text();
    if (raw.length > 1100000) throw new Error("入力が大きすぎます。");
    const p = schema.parse(JSON.parse(raw));
    let result: unknown = { ok: true };
    switch (p.action) {
      case "corporateAction":
        await recordCorporateAction(p.id, p.date, p.kind, p.details);
        await enqueue("paper", {}, "paper:" + randomUUID());
        break;
      case "deleteCorporateAction":
        await db().execute({
          sql: "DELETE FROM corporate_actions WHERE id=?",
          args: [p.id],
        });
        break;
      case "watch":
        await db().execute({
          sql: "UPDATE instruments SET watched=? WHERE id=?",
          args: [p.enabled ? 1 : 0, p.id],
        });
        if (p.enabled)
          result = await enqueue(
            "refresh",
            { instrumentId: p.id },
            "watch:" + p.id + ":" + new Date().toISOString().slice(0, 10),
          );
        break;
      case "refresh":
        if (p.id)
          result = await enqueue(
            "refresh",
            { instrumentId: p.id },
            "refresh:" + p.id + ":" + new Date().toISOString().slice(0, 16),
          );
        else await scheduleDaily();
        break;
      case "master":
        if (process.env.APP_MODE !== "live")
          throw new Error("実市場の接続にはAPP_MODE=liveを設定してください。");
        result = await enqueue(
          "master",
          {},
          "master:" + new Date().toISOString().slice(0, 10),
        );
        break;
      case "evaluate":
        if (!(await rateLimit("evaluation", 15, 3600)))
          throw new Error("評価依頼は1時間15回までです。");
        result = await requestEvaluation(
          p.id,
          p.document,
          p.sourceUrl || null,
          p.permission,
          !!p.force,
        );
        break;
      case "csv":
        result = { id: await importCsv(p.name, p.text) };
        break;
      case "alert":
        if (p.type === "positive" && Number(p.threshold) > 1)
          throw new Error("確信度は0〜1です。");
        await db().execute({
          sql: "INSERT INTO alerts(id,instrument_id,type,threshold) VALUES(?,?,?,?)",
          args: [randomUUID(), p.id, p.type, p.threshold],
        });
        await enqueue("alerts", {}, "alerts:" + randomUUID());
        break;
      case "deleteAlert":
        await db().execute({
          sql: "UPDATE alerts SET active=0 WHERE id=?",
          args: [p.id],
        });
        break;
      case "readAlert":
        await db().execute({
          sql: "UPDATE alert_events SET read=1 WHERE id=?",
          args: [p.id],
        });
        break;
      case "paper":
        await createAccounts(p);
        await enqueue("paper", {}, "paper:" + randomUUID());
        break;
      case "paperState":
        await db().execute({
          sql: "UPDATE accounts SET state=? WHERE id=?",
          args: [p.state, p.id],
        });
        if (p.state === "active")
          await enqueue("paper", {}, "paper:" + randomUUID());
        break;
      case "retry": {
        const job = (
          await query<{ payload: string; kind: string }>(
            "SELECT * FROM jobs WHERE id=? AND state=?",
            [p.id, "failed"],
          )
        )[0];
        if (!job) throw new Error("再試行できるジョブがありません。");
        await db().execute({
          sql: "UPDATE jobs SET state='pending',attempts=0,error=NULL,run_after=? WHERE id=?",
          args: [new Date().toISOString(), p.id],
        });
        break;
      }
      case "run":
        break;
    }
    await db().execute({
      sql: "INSERT INTO audit VALUES(?,?,?,?)",
      args: [
        randomUUID(),
        p.action,
        JSON.stringify({ id: "id" in p ? p.id : null }),
        new Date().toISOString(),
      ],
    });
    after(async () => {
      try {
        await runJobs(45000);
      } catch {
        console.error(
          "Background batch failed; persisted jobs will be recovered.",
        );
      }
    });
    return Response.json({ ok: true, data: result });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "入力内容を確認してください。"
            : e instanceof Error
              ? e.message
              : "処理に失敗しました。",
      },
      { status: 400 },
    );
  }
}
