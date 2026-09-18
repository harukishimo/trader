"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type Time,
} from "lightweight-charts";
import type { Bar } from "@/core/types";
export function PriceChart({
  bars,
  color = "#397f61",
  height = 320,
  candles = true,
}: {
  bars: Bar[];
  color?: string;
  height?: number;
  candles?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !bars.length) return;
    const chart = createChart(container.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#84908a",
        fontFamily: "Arial",
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#f0f2ee" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: "#b6c5ba" },
        horzLine: { color: "#b6c5ba" },
      },
    });
    if (candles) {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: color,
        downColor: "#c17964",
        borderVisible: false,
        wickUpColor: color,
        wickDownColor: "#c17964",
      });
      series.setData(
        bars.map((b) => ({
          time: b.date as Time,
          open: Number(b.open),
          high: Number(b.high),
          low: Number(b.low),
          close: Number(b.close),
        })),
      );
      series
        .priceScale()
        .applyOptions({ scaleMargins: { top: 0.1, bottom: 0.23 } });
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      vol.setData(
        bars.map((b) => ({
          time: b.date as Time,
          value: b.volume,
          color: Number(b.close) >= Number(b.open) ? "#dcebe0" : "#f1ddd7",
        })),
      );
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    } else {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
      });
      line.setData(
        bars.map((b) => ({ time: b.date as Time, value: Number(b.close) })),
      );
    }
    const ma = chart.addSeries(LineSeries, {
      color: "#b99c65",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ma.setData(
      bars
        .map((b, i) => ({
          time: b.date as Time,
          value:
            i < 19
              ? NaN
              : bars
                  .slice(i - 19, i + 1)
                  .reduce((s, x) => s + Number(x.close), 0) / 20,
        }))
        .filter((x) => Number.isFinite(x.value)),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, color, height, candles]);
  return (
    <div>
      <div
        ref={container}
        className="price-chart"
        style={{ height }}
        aria-label="価格と出来高のチャート"
      />
      <a
        className="chart-attribution"
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
      >
        Charts by TradingView Lightweight Charts™
      </a>
    </div>
  );
}
export function Sparkline({
  values,
  color = "#397f61",
  large = false,
}: {
  values: number[];
  color?: string;
  large?: boolean;
}) {
  if (values.length < 2) return <span className="muted">—</span>;
  const min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 200},${55 - ((v - min) / (max - min || 1)) * 48}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 200 60"
      className={large ? "sparkline large" : "sparkline"}
      role="img"
      aria-label="価格の推移"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
