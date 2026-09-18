import Decimal from "decimal.js";
import type { Bar } from "./types";
export function indicators(bars: Bar[]) {
  const avg = (n: number) =>
    bars.length < n
      ? null
      : bars
          .slice(-n)
          .reduce((s, b) => s.plus(b.close), new Decimal(0))
          .div(n)
          .toNumber();
  const last = bars.at(-1),
    prev = bars.at(-2);
  return {
    sma20: avg(20),
    sma60: avg(60),
    change:
      last && prev
        ? new Decimal(last.close).div(prev.close).minus(1).mul(100).toNumber()
        : null,
  };
}
export function positionSize(
  cash: string,
  price: string,
  allocation: string,
  lot: number,
  feeBps = "0",
) {
  return new Decimal(cash)
    .mul(allocation)
    .div(
      new Decimal(price).mul(
        new Decimal(1).plus(new Decimal(feeBps).div(10000)),
      ),
    )
    .div(lot)
    .floor()
    .mul(lot)
    .toFixed(0);
}
export function maxDrawdown(values: number[]) {
  let peak = 0,
    dd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.max(dd, ((peak - v) / peak) * 100);
  }
  return dd;
}
export function marketOpenUtc(date: string) {
  return date + "T00:00:00.000Z";
}
export function stale(date: string, now = new Date()) {
  let businessDays = 0;
  const d = new Date(date + "T00:00:00Z");
  while (d < now) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d <= now && ![0, 6].includes(d.getUTCDay())) businessDays++;
  }
  return businessDays > 3;
}
