import { createHash, randomUUID } from "node:crypto";
import { db, query } from "./db";
import type { Bar, Instrument } from "./types";
export function hash(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export const demoInstruments: Instrument[] = [
  {
    id: "demo-1",
    symbol: "DM01",
    name: "青葉テクノロジー",
    sector: "情報・通信",
    currency: "JPY",
    lot: 100,
    origin: "demo",
    watched: 1,
    color: "#397f61",
  },
  {
    id: "demo-2",
    symbol: "DM02",
    name: "北辰モビリティ",
    sector: "輸送用機器",
    currency: "JPY",
    lot: 100,
    origin: "demo",
    watched: 1,
    color: "#668abd",
  },
  {
    id: "demo-3",
    symbol: "DM03",
    name: "日和リテール",
    sector: "小売業",
    currency: "JPY",
    lot: 100,
    origin: "demo",
    watched: 1,
    color: "#cf8b5b",
  },
  {
    id: "demo-4",
    symbol: "DM04",
    name: "碧海エネルギー",
    sector: "エネルギー",
    currency: "JPY",
    lot: 100,
    origin: "demo",
    watched: 1,
    color: "#9276b0",
  },
  {
    id: "demo-5",
    symbol: "DM05",
    name: "みらいインデックスETF",
    sector: "ETF",
    currency: "JPY",
    lot: 1,
    origin: "demo",
    watched: 0,
    color: "#6b9c91",
  },
  {
    id: "demo-6",
    symbol: "DM06",
    name: "東雲ヘルスケア",
    sector: "医薬品",
    currency: "JPY",
    lot: 100,
    origin: "demo",
    watched: 0,
    color: "#c77070",
  },
];
export function demoBars(index: number, until = new Date()): Bar[] {
  const result: Bar[] = [];
  const end = new Date(until.toISOString().slice(0, 10) + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 400);
  let n = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if ([0, 6].includes(d.getUTCDay())) continue;
    const day = Math.floor(d.getTime() / 86400000);
    const base = [2400, 3100, 1450, 4200, 22000, 1850][index];
    const close =
      base *
      (1 +
        0.09 * Math.sin(day / 27 + index) +
        0.035 * Math.sin(day / 6 + index * 2) +
        0.00008 * (day - 20000));
    const open = close * (1 + 0.008 * Math.sin(day * 3 + index));
    const date = d.toISOString().slice(0, 10);
    result.push({
      date,
      open: open.toFixed(2),
      high: (Math.max(open, close) * 1.012).toFixed(2),
      low: (Math.min(open, close) * 0.989).toFixed(2),
      close: close.toFixed(2),
      volume: Math.round(300000 + 250000 * (1 + Math.sin(day + index))),
      availableAt: date + "T09:00:00Z",
      receivedAt: date + "T09:00:00Z",
    });
    n++;
  }
  return result.slice(n - 260);
}
export async function saveBars(id: string, bars: Bar[], origin: string) {
  for (let i = 0; i < bars.length; i += 100)
    await db().batch(
      bars
        .slice(i, i + 100)
        .map((b) => ({
          sql: "INSERT OR IGNORE INTO bars VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            hash(
              JSON.stringify([
                id,
                origin,
                b.date,
                b.open,
                b.high,
                b.low,
                b.close,
                b.volume,
              ]),
            ),
            id,
            b.date,
            b.open,
            b.high,
            b.low,
            b.close,
            b.volume,
            b.receivedAt,
            b.availableAt,
            origin,
          ],
        })),
      "write",
    );
}
export async function seed() {
  for (const [index, item] of demoInstruments.entries()) {
    await db().execute({
      sql: "INSERT OR IGNORE INTO instruments VALUES(?,?,?,?,?,?,?,?,?)",
      args: [
        item.id,
        item.symbol,
        item.name,
        item.sector,
        item.currency,
        item.lot,
        item.origin,
        item.watched,
        item.color,
      ],
    });
    await saveBars(item.id, demoBars(index), "demo");
  }
}
export async function getBars(id: string, asOf?: string): Promise<Bar[]> {
  return query<Bar>(
    `SELECT date,open,high,low,close,volume,received_at as receivedAt,available_at as availableAt FROM (SELECT *,row_number() OVER(PARTITION BY date ORDER BY received_at DESC,id DESC) as rn FROM bars WHERE instrument_id=? ${asOf ? "AND received_at<=? AND available_at<=?" : ""}) WHERE rn=1 ORDER BY date`,
    asOf ? [id, asOf, asOf] : [id],
  );
}
export function validateBars(bars: Bar[]) {
  if (!bars.length || bars.length > 10000)
    throw new Error("1〜10,000行の価格データが必要です。");
  const dates = new Set<string>();
  for (const b of bars) {
    const numbers = [b.open, b.high, b.low, b.close].map(Number);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      new Date(b.date).toISOString().slice(0, 10) !== b.date ||
      numbers.some((n) => !Number.isFinite(n) || n <= 0) ||
      !Number.isSafeInteger(b.volume) ||
      b.volume < 0 ||
      Number(b.high) < Math.max(Number(b.open), Number(b.close)) ||
      Number(b.low) > Math.min(Number(b.open), Number(b.close)) ||
      dates.has(b.date)
    )
      throw new Error("日付、OHLC、出来高、重複行を確認してください。");
    dates.add(b.date);
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}
export function parseCsv(text: string): Bar[] {
  const lines = text
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const header = lines.shift()?.trim();
  if (header !== "date,open,high,low,close,volume")
    throw new Error("CSVヘッダー: date,open,high,low,close,volume");
  const now = new Date().toISOString();
  return validateBars(
    lines.map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      if (cells.length !== 6) throw new Error("CSVは6列で指定してください。");
      const [date, open, high, low, close, volume] = cells;
      return {
        date,
        open,
        high,
        low,
        close,
        volume: Number(volume),
        receivedAt: now,
        availableAt: date + "T09:00:00Z",
      };
    }),
  );
}
async function jquants(path: string, params: Record<string, string>) {
  if (!process.env.JQUANTS_API_KEY)
    throw new Error("JQUANTS_API_KEYが未設定です。");
  const url = new URL("https://api.jquants.com/v2/" + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, {
    headers: { "x-api-key": process.env.JQUANTS_API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error(`市場データ取得に失敗しました（HTTP ${r.status}）。`);
  return r.json();
}
export async function syncMaster() {
  let key: string | undefined;
  let pages = 0;
  do {
    const data = await jquants(
      "equities/master",
      key ? { pagination_key: key } : {},
    );
    if (!Array.isArray(data.data))
      throw new Error("銘柄マスターの応答形式が不正です。");
    await db().batch(
      data.data.map((x: Record<string, unknown>) => ({
        sql: "INSERT INTO instruments VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sector=excluded.sector",
        args: [
          "jp-" + String(x.Code),
          String(x.Code),
          String(x.CoName ?? x.Code),
          String(x.S17Nm ?? "国内株式"),
          "JPY",
          100,
          "jquants",
          0,
          "#397f61",
        ],
      })),
      "write",
    );
    key = data.pagination_key;
    if (++pages > 15) throw new Error("マスターの取得上限に達しました。");
  } while (key);
}
export async function refreshInstrument(item: Instrument) {
  if (item.origin === "demo") {
    await saveBars(
      item.id,
      demoBars(demoInstruments.findIndex((x) => x.id === item.id)),
      "demo",
    );
    return;
  }
  if (item.origin === "csv") return;
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  let key: string | undefined;
  let pages = 0;
  do {
    const data = await jquants("equities/bars/daily", {
      code: item.symbol,
      from: from.toISOString().slice(0, 10),
      ...(key ? { pagination_key: key } : {}),
    });
    if (!Array.isArray(data.data)) throw new Error("価格応答形式が不正です。");
    const now = new Date().toISOString();
    const bars: Bar[] = data.data
      .filter((x: Record<string, unknown>) => x.O != null && x.C != null)
      .map((x: Record<string, unknown>) => ({
        date: String(x.Date),
        open: String(x.O),
        high: String(x.H),
        low: String(x.L),
        close: String(x.C),
        volume: Number(x.Vo),
        receivedAt: now,
        availableAt: String(x.Date) + "T09:00:00Z",
      }));
    if (bars.length) await saveBars(item.id, validateBars(bars), "jquants");
    key = data.pagination_key;
    if (++pages > 10) throw new Error("価格取得上限に達しました。");
  } while (key);
}
export async function importCsv(name: string, text: string) {
  const id = "csv-" + randomUUID();
  const bars = parseCsv(text);
  await db().execute({
    sql: "INSERT INTO instruments VALUES(?,?,?,?,?,?,?,?,?)",
    args: [id, "CSV", name, "インポート", "JPY", 1, "csv", 1, "#9276b0"],
  });
  await saveBars(id, bars, "csv");
  return id;
}
