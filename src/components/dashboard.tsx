"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  ArrowUpLeft,
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Upload,
  Clock,
  Menu,
} from "lucide-react";
import type { Bootstrap, Answers, Evaluation, Bar } from "@/core/types";
import { PriceChart, Sparkline } from "./chart";

const yen = (v: string | number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(
    Number(v),
  );
const dateTime = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未実行";
const labels: Record<string, string> = {
  positive: "業績改善",
  negative: "業績悪化",
  mixed: "材料が混在",
  unknown: "情報不足",
  upward_revision: "上方修正",
  downward_revision: "下方修正",
  capital_policy: "資本政策",
  other: "その他",
  succeeded: "完了",
  pending: "待機中",
  running: "処理中",
  failed: "失敗",
  retry_wait: "再試行待ち",
  active: "実行中",
  paused: "一時停止",
  stopped: "損失制限で停止",
  demo: "デモ",
  jquants: "J-Quants",
  csv: "CSV",
};
function Change({ bars }: { bars: Bar[] }) {
  const a = Number(bars.at(-1)?.close),
    b = Number(bars.at(-2)?.close);
  const change = b ? (a / b - 1) * 100 : 0;
  return (
    <span className={change >= 0 ? "positive" : "negative"}>
      {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
      {change >= 0 ? "+" : ""}
      {change.toFixed(2)}%
    </span>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <Activity size={24} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function SectionTitle({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
type Item = Bootstrap["instruments"][number];

export function Dashboard({
  initial,
  path,
}: {
  initial: Bootstrap;
  path: string[];
}) {
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [period, setPeriod] = useState(90),
    [candles, setCandles] = useState(true);
  const [chosen, setChosen] = useState(
    initial.instruments.find((i) => i.watched)?.id ??
      initial.instruments[0]?.id ??
      "",
  );
  const [compareIds, setCompareIds] = useState(
    initial.instruments
      .filter((i) => i.watched)
      .slice(0, 3)
      .map((i) => i.id),
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const page = path[0] || "overview";
  const watched = data.instruments.filter((i) => i.watched);
  const current =
    data.instruments.find(
      (i) => i.id === (page === "instruments" ? path[1] : chosen),
    ) ??
    watched[0] ??
    data.instruments[0];
  const names: Record<string, string> = {
    overview: "ダッシュボード",
    watchlist: "ウォッチリスト",
    instruments: "商品詳細",
    compare: "商品を比較",
    evaluations: "Jev の評価",
    paper: "模擬運用",
    alerts: "アラート",
    settings: "設定・稼働状況",
  };
  const nav = [
    {
      id: "overview",
      href: "/",
      icon: LayoutDashboard,
      name: "ダッシュボード",
    },
    { id: "watchlist", href: "/watchlist", icon: Star, name: "ウォッチリスト" },
    { id: "compare", href: "/compare", icon: BarChart3, name: "商品を比較" },
    {
      id: "evaluations",
      href: "/evaluations",
      icon: Sparkles,
      name: "Jev の評価",
    },
    { id: "paper", href: "/paper", icon: BookOpen, name: "模擬運用" },
    { id: "alerts", href: "/alerts", icon: Bell, name: "アラート" },
  ];
  const refresh = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.status === 401) {
      location.reload();
      return;
    }
    if (!r.ok)
      throw new Error(
        "データの更新に失敗しました。最後に取得した内容を表示しています。",
      );
    setData(await r.json());
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 15000;
    const tick = async () => {
      if (!document.hidden) {
        try {
          await refresh();
          delay = 15000;
        } catch (e) {
          if (alive)
            setError(e instanceof Error ? e.message : "更新できません。");
          delay = Math.min(delay * 2, 120000);
        }
      }
      if (alive) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(
        body.action === "evaluate"
          ? "評価を受け付けました。結果は自動更新されます。"
          : "保存しました。",
      );
      await refresh();
      setModal(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const bars = current?.bars.slice(-period) ?? [];
  const latest = current
    ? data.evaluations.find(
        (e) => e.instrument_id === current.id && e.status === "succeeded",
      )
    : undefined;
  const positives = watched.filter(
    (i) => Number(i.bars.at(-1)?.close) >= Number(i.bars.at(-2)?.close),
  ).length;
  const evalForm = (item: Item) => (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act({
          action: "evaluate",
          id: item.id,
          document: f.get("document"),
          sourceUrl: f.get("sourceUrl"),
          permission: f.get("permission") === "on",
          force: f.get("force") === "on",
        });
      }}
    >
      <label>
        評価する資料
        <textarea
          name="document"
          rows={5}
          minLength={10}
          maxLength={24000}
          required
          defaultValue={
            item.origin === "demo"
              ? "【合成デモ資料】青葉テクノロジーは通期の営業利益予想を15%上方修正。法人向けサービスの受注増加による増益を見込む。実在する企業の情報ではありません。"
              : ""
          }
          placeholder="開示情報やニュースの本文を貼り付け"
        />
      </label>
      <label>
        出典URL（任意）
        <input name="sourceUrl" type="url" placeholder="https://…" />
      </label>
      <label className="check">
        <input
          name="permission"
          type="checkbox"
          required={data.status.jev === "typesafe"}
        />
        この資料を外部AIに送信する権限があります
      </label>
      <label className="check">
        <input name="force" type="checkbox" />
        同じ資料も再評価する（API使用量が増えます）
      </label>
      <button className="primary" disabled={busy}>
        <Sparkles size={16} />
        {busy ? "送信中…" : "資料を評価する"}
      </button>
      <small>
        {data.status.jev === "mock"
          ? "現在はキーワード規則によるデモ評価です。Jev APIは呼び出しません。"
          : "Jevが材料の分類と業績への方向性を評価します。"}
      </small>
    </form>
  );
  const chartCard = (detail = false) => (
    <div className="card chart-card">
      <SectionTitle
        title={detail ? "価格の推移" : "マーケットの流れ"}
        sub={
          detail
            ? "日足・未調整価格 / 移動平均20日"
            : "気になる商品の動きを、ひと目で。"
        }
      >
        <div className="segmented">
          {[30, 90, 180, 260].map((n) => (
            <button
              key={n}
              className={period === n ? "active" : ""}
              onClick={() => setPeriod(n)}
            >
              {n === 30 ? "1M" : n === 90 ? "3M" : n === 180 ? "6M" : "1Y"}
            </button>
          ))}
        </div>
      </SectionTitle>
      {current ? (
        <>
          <div className="chart-head">
            <div>
              <div className="instrument-title">
                <span
                  className="instrument-icon"
                  style={{
                    background: current.color + "18",
                    color: current.color,
                  }}
                >
                  {current.name.slice(0, 1)}
                </span>
                <div>
                  <select
                    aria-label="チャートの商品"
                    value={current.id}
                    onChange={(e) => setChosen(e.target.value)}
                    disabled={detail}
                  >
                    {(detail
                      ? [current]
                      : watched.length
                        ? watched
                        : data.instruments
                    ).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <div className="muted tiny">
                    {current.symbol} · {current.sector}
                  </div>
                </div>
              </div>
              <div className="price-line">
                <strong>
                  ¥{current.bars.length ? yen(current.bars.at(-1)!.close) : "—"}
                </strong>
                <Change bars={current.bars} />
              </div>
            </div>
            <div className="chart-meta">
              <Badge tone={current.origin === "demo" ? "amber" : "neutral"}>
                {labels[current.origin]} · 日次
              </Badge>
              <span>{current.bars.at(-1)?.date ?? "未取得"} 時点</span>
              <button
                className="text-button"
                onClick={() => setCandles(!candles)}
              >
                {candles ? "折れ線に切替" : "ローソク足に切替"}
              </button>
            </div>
          </div>
          {bars.length ? (
            <PriceChart bars={bars} color={current.color} candles={candles} />
          ) : (
            <Empty
              title="価格データを待っています"
              body="商品を登録して更新するか、CSVを取り込んでください。"
            />
          )}
          <div className="chart-footer">
            <span>
              <i style={{ background: current.color }} />
              価格 <i style={{ background: "#b99c65" }} />
              20日移動平均
            </span>
            <span>JPY · {bars.length}営業日</span>
          </div>
          {detail && (
            <details className="data-table">
              <summary>価格データを表で確認</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>始値</th>
                      <th>高値</th>
                      <th>安値</th>
                      <th>終値</th>
                      <th>出来高</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bars
                      .slice()
                      .reverse()
                      .map((b) => (
                        <tr key={b.date}>
                          <td>{b.date}</td>
                          <td>{yen(b.open)}</td>
                          <td>{yen(b.high)}</td>
                          <td>{yen(b.low)}</td>
                          <td>{yen(b.close)}</td>
                          <td>{yen(b.volume)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      ) : (
        <Empty
          title="商品を追加しましょう"
          body="ウォッチリストに追加すると、ここに価格の推移が表示されます。"
        />
      )}
    </div>
  );
  function evaluationCard(e: Evaluation) {
    const a = e.answer ? (JSON.parse(e.answer) as Answers) : null;
    return (
      <div className="evaluation-row" key={e.id}>
        <div className="row-between">
          <Link href={"/evaluations/" + e.id}>
            <strong>
              {data.instruments.find((i) => i.id === e.instrument_id)?.name ??
                e.instrument_id}
            </strong>
          </Link>
          <Badge
            tone={
              e.status === "succeeded"
                ? "green"
                : e.status === "failed"
                  ? "red"
                  : "neutral"
            }
          >
            {labels[e.status]}
          </Badge>
        </div>
        <div className="row-between">
          <span>
            {a ? labels[a.event_type.choice] : "資料を評価中"}{" "}
            {a && <Badge>{labels[a.direction.choice]}</Badge>}
          </span>
          <small>{dateTime(e.created_at)}</small>
        </div>
        {e.error && <p className="negative">{e.error}</p>}
        <small>
          {e.origin === "mock" ? "デモ評価" : "Jev"} ·{" "}
          {a ? `確信度 ${Math.round(a.direction.confidence * 100)}%` : "—"}
        </small>
      </div>
    );
  }
  const watchTable = (
    <div className="card">
      <SectionTitle title="ウォッチリスト" sub="自分だけのマーケットをつくる。">
        <button className="text-button" onClick={() => setModal("search")}>
          <Plus size={16} />
          商品を追加
        </button>
      </SectionTitle>
      {watched.length ? (
        <div className="table-scroll">
          <table className="watch-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>価格</th>
                <th>前営業日比</th>
                <th>30日間の推移</th>
                <th>データ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {watched.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link
                      className="instrument-title"
                      href={"/instruments/" + i.id}
                    >
                      <span
                        className="instrument-icon"
                        style={{ color: i.color, background: i.color + "18" }}
                      >
                        {i.name.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{i.name}</strong>
                        <small>
                          {i.symbol} · {i.sector}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td className="number">
                    ¥{i.bars.length ? yen(i.bars.at(-1)!.close) : "—"}
                  </td>
                  <td>
                    <Change bars={i.bars} />
                  </td>
                  <td>
                    <Sparkline
                      values={i.bars.slice(-30).map((b) => Number(b.close))}
                      color={i.color}
                    />
                  </td>
                  <td>
                    <Badge tone={i.origin === "demo" ? "amber" : "neutral"}>
                      {labels[i.origin]}
                    </Badge>
                    <small>{i.bars.at(-1)?.date ?? "未取得"}</small>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      title={i.name + "を解除"}
                      onClick={() =>
                        void act({ action: "watch", id: i.id, enabled: false })
                      }
                      disabled={busy}
                    >
                      <Star size={17} fill="#d9b972" color="#b69a59" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="ウォッチリストは空です"
          body="「商品を追加」から気になる商品を登録してください。"
        />
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Link href="/" className="brand">
          <span className="brand-mark">t</span>trader
          <span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <span className="avatar">H</span>
          <div>
            <strong>マイワークスペース</strong>
            <small>PERSONAL ACCOUNT</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setMobile(false)}
              className={
                page === n.id ||
                (page === "instruments" && n.id === "watchlist")
                  ? "selected"
                  : ""
              }
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "watchlist" && (
                <span className="nav-count">{watched.length}</span>
              )}
              {n.id === "alerts" && data.alertEvents.some((e) => !e.read) && (
                <span className="notification-dot" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="jev-promo">
            <Sparkles size={22} />
            <strong>情報に、もうひとつの視点。</strong>
            <p>
              Jevで材料を評価して、
              <br />
              自分の判断を深める。
            </p>
            <Link href="/evaluations">
              評価をはじめる <ArrowRight size={14} />
            </Link>
          </div>
          <Link
            href="/settings"
            className={
              "settings-link " + (page === "settings" ? "selected" : "")
            }
          >
            <Settings size={18} />
            設定・稼働状況
          </Link>
          <div className="connection">
            <span className="live-dot" />
            {data.status.mode === "demo"
              ? "デモワークスペース"
              : "プライベートワークスペース"}
            <button
              className="icon-button"
              aria-label="ログアウト"
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                location.reload();
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="メニュー"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={13} />
            <strong>{names[page]}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="global-search"
              onClick={() => setModal("search")}
            >
              <Search size={15} />
              商品を探す<span>⌘ K</span>
            </button>
            <Link href="/alerts" className="icon-button" aria-label="アラート">
              <Bell size={18} />
            </Link>
            <span className="avatar small">H</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "overview"
                  ? "YOUR MARKET, AT A GLANCE"
                  : "PERSONAL INVESTMENT OBSERVATORY"}
              </div>
              <h1>{page === "overview" ? "投資を、見渡す。" : names[page]}</h1>
              <p>
                {page === "overview"
                  ? "市場の動きも、情報の意味も。ここから、今日の判断を。"
                  : "価格・情報・判断の履歴を、自分のペースで。"}
              </p>
            </div>
            <div className="heading-actions">
              <span className="date-label">
                {new Date().toLocaleDateString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                })}
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "refresh",
                    ...(page === "instruments" && current
                      ? { id: current.id }
                      : {}),
                  })
                }
              >
                <RefreshCw size={15} className={busy ? "spinning" : ""} />
                更新
              </button>
              <button className="primary" onClick={() => setModal("search")}>
                <Plus size={17} />
                商品を追加
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="閉じる"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="toast" role="status">
              <Check size={16} />
              {message}
            </div>
          )}
          {data.status.mode === "demo" && (
            <div className="demo-notice">
              <span className="demo-pill">DEMO</span>{" "}
              表示中のデモ商品・価格・評価は合成データです。実際の市場情報ではありません。
              <Link href="/settings">
                接続設定 <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {page === "overview" && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div>
                    ウォッチ中の商品
                    <Star size={16} />
                  </div>
                  <strong>
                    {watched.length}
                    <span>商品</span>
                  </strong>
                  <small>
                    <span className="positive">{positives} 上昇</span>
                    <span className="muted">
                      {" "}
                      / {watched.length - positives} 下落
                    </span>
                  </small>
                </div>
                <div className="stat-card">
                  <div>
                    Jev の評価
                    <Sparkles size={16} />
                  </div>
                  <strong>
                    {
                      data.evaluations.filter((e) => e.status === "succeeded")
                        .length
                    }
                    <span>件</span>
                  </strong>
                  <small>材料を整理し、判断をサポート</small>
                </div>
                <div className="stat-card">
                  <div>
                    模擬運用の損益
                    <TrendingUp size={16} />
                  </div>
                  <strong
                    className={
                      data.accounts.reduce((s, a) => s + Number(a.pnl), 0) < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    ¥{yen(data.accounts.reduce((s, a) => s + Number(a.pnl), 0))}
                  </strong>
                  <small>
                    {data.accounts.length
                      ? `${data.accounts.length}口座 · 税引前・模擬`
                      : "模擬運用をはじめて比較する"}
                  </small>
                </div>
                <div className="stat-card">
                  <div>
                    データの更新
                    <Activity size={16} />
                  </div>
                  <strong className="status-value">
                    <span className="live-dot" />
                    {data.jobs.some((j) => j.state === "running")
                      ? "更新中"
                      : "日次データ"}
                  </strong>
                  <small>
                    {data.status.lastRun
                      ? dateTime(data.status.lastRun) + " 最終処理"
                      : "手動更新・定期更新に対応"}
                  </small>
                </div>
              </div>
              <div className="overview-grid">
                {chartCard()}
                <div className="card insight-card">
                  <div className="insight-header">
                    <span className="ai-symbol">
                      <Sparkles size={20} />
                    </span>
                    <Badge tone="green">
                      {data.status.jev === "mock" ? "DEMO AI" : "JEV AI"}
                    </Badge>
                  </div>
                  <h2>情報を、判断のヒントに。</h2>
                  <p>
                    気になる材料を整理して、
                    <br />
                    価格の動きにもう一つの視点を。
                  </p>
                  {latest ? (
                    evaluationCard(latest)
                  ) : (
                    <div className="insight-placeholder">
                      <span className="mini-line" />
                      <span className="mini-line short" />
                      <p>
                        資料を評価すると、材料の分類と
                        <br />
                        業績への方向性が表示されます。
                      </p>
                    </div>
                  )}
                  <button
                    className="primary full"
                    disabled={!current}
                    onClick={() => setModal("evaluate")}
                  >
                    <Sparkles size={16} />
                    資料を評価する
                    <ArrowRight size={15} />
                  </button>
                  <small className="insight-foot">
                    確信度は投資の勝率ではありません
                  </small>
                </div>
              </div>
              {watchTable}
              <div className="bottom-grid">
                <div className="card">
                  <SectionTitle title="最近の評価">
                    <Link className="text-button" href="/evaluations">
                      すべて見る <ArrowRight size={14} />
                    </Link>
                  </SectionTitle>
                  {data.evaluations.length ? (
                    data.evaluations.slice(0, 3).map(evaluationCard)
                  ) : (
                    <Empty
                      title="最初の評価をはじめましょう"
                      body="開示やニュースを貼り付け、材料の意味を整理できます。"
                    />
                  )}
                </div>
                <div className="quiet-card">
                  <ShieldCheck size={26} />
                  <h3>まずは、模擬運用から。</h3>
                  <p>
                    同じルールでJevあり・なしの成績を比較。
                    <br />
                    実際の資金を使わず、判断を確かめられます。
                  </p>
                  <Link href="/paper">
                    模擬運用をはじめる <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </>
          )}
          {page === "watchlist" && (
            <>
              {watchTable}
              <div className="card import-card">
                <div>
                  <h3>自分のデータで分析する</h3>
                  <p>保有している日足CSVを取り込めます。</p>
                </div>
                <button className="secondary" onClick={() => setModal("csv")}>
                  <Upload size={16} />
                  CSVを取り込む
                </button>
              </div>
            </>
          )}
          {page === "instruments" && current && (
            <>
              <Link className="text-button back" href="/watchlist">
                <ArrowUpLeft size={15} />
                ウォッチリストに戻る
              </Link>
              {chartCard(true)}
              <div className="bottom-grid">
                <div className="card">
                  <SectionTitle
                    title="この商品の資料を評価"
                    sub="評価時点の資料・価格・質問の版を保存します。"
                  />
                  {evalForm(current)}
                </div>
                <div className="card">
                  <SectionTitle title="評価タイムライン" />
                  {data.evaluations.filter(
                    (e) => e.instrument_id === current.id,
                  ).length ? (
                    data.evaluations
                      .filter((e) => e.instrument_id === current.id)
                      .map(evaluationCard)
                  ) : (
                    <Empty
                      title="評価はまだありません"
                      body="左のフォームから評価を依頼できます。"
                    />
                  )}
                  <button
                    className="secondary"
                    onClick={() => setModal("alert")}
                  >
                    <Bell size={15} />
                    この商品のアラートを作成
                  </button>
                </div>
              </div>
            </>
          )}
          {page === "compare" && (
            <div className="card">
              <SectionTitle
                title="同じ起点で、値動きを比べる"
                sub="共通の取引日を100として比較 · JPY · 為替調整なし"
              />
              <div className="compare-options">
                {watched.map((i) => (
                  <label key={i.id} className="check">
                    <input
                      type="checkbox"
                      checked={compareIds.includes(i.id)}
                      onChange={() =>
                        setCompareIds((s) =>
                          s.includes(i.id)
                            ? s.filter((x) => x !== i.id)
                            : [...s, i.id],
                        )
                      }
                    />
                    {i.name}
                  </label>
                ))}
              </div>
              <CompareChart
                items={data.instruments.filter((i) =>
                  compareIds.includes(i.id),
                )}
              />
            </div>
          )}
          {page === "evaluations" &&
            (!path[1] ? (
              <>
                <div className="row-between panel-toolbar">
                  <p className="muted">
                    元資料と判断の履歴を、いつでも振り返る。
                  </p>
                  <button
                    className="primary"
                    disabled={!current}
                    onClick={() => setModal("evaluate")}
                  >
                    <Plus size={16} />
                    新しい評価
                  </button>
                </div>
                <div className="card">
                  {data.evaluations.length ? (
                    data.evaluations.map(evaluationCard)
                  ) : (
                    <Empty
                      title="評価履歴はまだありません"
                      body="商品を選んで、開示情報やニュースを評価してください。"
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="card">
                {(() => {
                  const e = data.evaluations.find((x) => x.id === path[1]);
                  if (!e)
                    return (
                      <Empty
                        title="評価が見つかりません"
                        body="評価一覧から選び直してください。"
                      />
                    );
                  const snapshot = JSON.parse(e.snapshot);
                  return (
                    <>
                      {evaluationCard(e)}
                      <div className="detail-grid">
                        <div>
                          <h3>評価に使用した資料</h3>
                          <p className="document-text">{snapshot.document}</p>
                          {snapshot.sourceUrl && (
                            <a
                              className="text-button"
                              href={snapshot.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              出典を開く ↗
                            </a>
                          )}
                          <small>入力時点：{dateTime(snapshot.asOf)}</small>
                        </div>
                        <div>
                          <h3>評価の記録</h3>
                          <dl>
                            <dt>モデル</dt>
                            <dd>{e.model}</dd>
                            <dt>質問の版</dt>
                            <dd>{e.question_version}</dd>
                            <dt>データ</dt>
                            <dd>{labels[snapshot.instrument.origin]}</dd>
                          </dl>
                          <details>
                            <summary>回答の分布</summary>
                            <pre>
                              {JSON.stringify(
                                e.answer ? JSON.parse(e.answer) : {},
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                          <details>
                            <summary>入力スナップショット</summary>
                            <pre>{JSON.stringify(snapshot, null, 2)}</pre>
                          </details>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          {page === "paper" && (
            <>
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  模擬売買のみ。20日移動平均を使う価格ルールと、Jevの業績改善評価を加えたルールを同条件で比較します。判断後の次の有効始値から約定を判定します。
                </span>
              </div>
              <div className="panel-toolbar row-between">
                <span className="muted">
                  税引前 · 手数料・スリッページ込み · AI / データ費用は別途
                </span>
                <button className="primary" onClick={() => setModal("paper")}>
                  <Plus size={16} />
                  比較運用を作成
                </button>
              </div>
              {data.accounts.length ? (
                <div className="paper-grid">
                  {data.accounts.map((a) => (
                    <div className="card" key={a.id}>
                      <SectionTitle
                        title={a.name}
                        sub={labels[a.origin] + " / 20日移動平均ルール v1"}
                      >
                        <Badge
                          tone={a.state === "active" ? "green" : "neutral"}
                        >
                          {labels[a.state]}
                        </Badge>
                      </SectionTitle>
                      <div className="paper-numbers">
                        <div>
                          <small>評価資産</small>
                          <strong>¥{yen(a.equity)}</strong>
                        </div>
                        <div>
                          <small>損益</small>
                          <strong
                            className={
                              Number(a.pnl) >= 0 ? "positive" : "negative"
                            }
                          >
                            ¥{yen(a.pnl)}
                          </strong>
                        </div>
                      </div>
                      {a.curve.length > 1 ? (
                        <Sparkline large values={a.curve.map((x) => x.value)} />
                      ) : (
                        <div className="muted paper-wait">
                          運用開始後の価格更新を待っています
                        </div>
                      )}
                      <dl>
                        <dt>仮想現金</dt>
                        <dd>¥{yen(a.cash)}</dd>
                        <dt>最大ドローダウン</dt>
                        <dd>{a.maxDrawdown.toFixed(2)}%</dd>
                        <dt>保有商品数</dt>
                        <dd>{a.holdings.length}</dd>
                      </dl>
                      {a.holdings.map((h) => (
                        <div className="row-between tiny" key={h.instrument_id}>
                          <span>
                            {
                              data.instruments.find(
                                (i) => i.id === h.instrument_id,
                              )?.name
                            }
                          </span>
                          <span>{h.quantity}株</span>
                        </div>
                      ))}
                      <div className="row-between">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void act({
                              action: "paperState",
                              id: a.id,
                              state: a.state === "active" ? "paused" : "active",
                            })
                          }
                        >
                          {a.state === "active" ? "一時停止" : "再開"}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            downloadCsv(a.fills, `paper-${a.id}.csv`)
                          }
                        >
                          <Download size={14} />
                          約定CSV
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="判断を、成績で確かめる。"
                  body="比較運用を作成すると、同じ仮想資金で2つの運用が始まります。"
                />
              )}
            </>
          )}
          {page === "alerts" && (
            <>
              <div className="panel-toolbar row-between">
                <span className="muted">
                  条件に到達したときだけ、お知らせします。
                </span>
                <button
                  className="primary"
                  disabled={!current}
                  onClick={() => setModal("alert")}
                >
                  <Plus size={16} />
                  条件を追加
                </button>
              </div>
              <div className="bottom-grid">
                <div className="card">
                  <SectionTitle title="アラート条件" />
                  {data.alerts.filter((a) => a.active).length ? (
                    data.alerts
                      .filter((a) => a.active)
                      .map((a) => (
                        <div className="evaluation-row row-between" key={a.id}>
                          <div>
                            <strong>
                              {
                                data.instruments.find(
                                  (i) => i.id === a.instrument_id,
                                )?.name
                              }
                            </strong>
                            <p>
                              {a.type === "above"
                                ? "価格が以上"
                                : a.type === "below"
                                  ? "価格が以下"
                                  : "業績改善の確信度が以上"}
                              ：{a.threshold}
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="条件を削除"
                            onClick={() =>
                              void act({ action: "deleteAlert", id: a.id })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))
                  ) : (
                    <Empty
                      title="条件は未設定です"
                      body="価格やJevの評価を条件に設定できます。"
                    />
                  )}
                </div>
                <div className="card">
                  <SectionTitle title="通知履歴" />
                  {data.alertEvents.length ? (
                    data.alertEvents.map((e) => (
                      <div className="evaluation-row" key={String(e.id)}>
                        <p>{String(e.message)}</p>
                        <div className="row-between">
                          <small>{dateTime(String(e.created_at))}</small>
                          {!e.read && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void act({ action: "readAlert", id: e.id })
                              }
                            >
                              既読にする
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="新しい通知はありません"
                      body="設定した条件に到達すると表示されます。"
                    />
                  )}
                </div>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <div className="settings-grid">
                <div className="card">
                  <SectionTitle title="データと接続" />
                  <dl>
                    <dt>保存先</dt>
                    <dd>{data.status.database}</dd>
                    <dt>市場データ</dt>
                    <dd>{data.status.market}</dd>
                    <dt>AI</dt>
                    <dd>
                      {data.status.jev === "mock"
                        ? "Mock / 外部呼出しなし"
                        : "TypeSafe Jev"}
                    </dd>
                    <dt>API設定</dt>
                    <dd>
                      {data.status.configured ? "利用可能" : "キー未設定"}
                    </dd>
                    <dt>最終処理</dt>
                    <dd>{dateTime(data.status.lastRun)}</dd>
                    <dt>Jev使用トークン</dt>
                    <dd>{yen(data.status.usage)}</dd>
                    <dt>API費用</dt>
                    <dd>未算出</dd>
                  </dl>
                  <p className="muted tiny">
                    接続設定はサーバー環境変数で変更します。秘密鍵はブラウザに送信しません。
                  </p>
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void act({ action: "master" })}
                    >
                      <Database size={14} />
                      実銘柄マスター同期
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setModal("csv")}
                    >
                      <Upload size={14} />
                      CSV取込
                    </button>
                  </div>
                </div>
                <div className="card">
                  <SectionTitle title="更新のしくみ" />
                  <div className="explain-item">
                    <Clock size={20} />
                    <div>
                      <strong>毎日の価格を、蓄積する</strong>
                      <p>
                        Vercel CronはUTC
                        10:00（日本時間19:00）に実行。プランによって起動時刻に幅があります。
                      </p>
                    </div>
                  </div>
                  <div className="explain-item">
                    <Activity size={20} />
                    <div>
                      <strong>途中で止まっても、再開</strong>
                      <p>
                        処理はDBに保存されます。失敗した処理は再試行でき、二重評価を抑制します。
                      </p>
                    </div>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void act({ action: "run" })}
                  >
                    <RefreshCw size={15} />
                    待機中の処理を実行
                  </button>
                </div>
              </div>
              <div className="card">
                <SectionTitle title="最近の処理" />
                {data.jobs.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>種類</th>
                          <th>状態</th>
                          <th>開始</th>
                          <th>試行</th>
                          <th>詳細</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.jobs.map((j) => (
                          <tr key={j.id}>
                            <td>{j.kind}</td>
                            <td>
                              <Badge
                                tone={
                                  j.state === "failed"
                                    ? "red"
                                    : j.state === "succeeded"
                                      ? "green"
                                      : "neutral"
                                }
                              >
                                {labels[j.state]}
                              </Badge>
                            </td>
                            <td>{dateTime(j.created_at)}</td>
                            <td>{j.attempts}</td>
                            <td>
                              {j.error}
                              <span> </span>
                              {j.state === "failed" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    void act({ action: "retry", id: j.id })
                                  }
                                >
                                  再試行
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="処理履歴はまだありません"
                    body="商品の更新や評価を実行すると表示されます。"
                  />
                )}
              </div>
            </>
          )}
          <footer className="footer">
            <span>
              <span className="footer-brand">trader.</span> Your perspective,
              informed.
            </span>
            <span>個人用の分析・模擬運用ツール · 実売買は行いません</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        className="modal"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="modal-heading">
          <h2>
            {modal === "search"
              ? "気になる商品を追加"
              : modal === "evaluate"
                ? "資料を評価する"
                : modal === "csv"
                  ? "CSVを取り込む"
                  : modal === "paper"
                    ? "比較運用をはじめる"
                    : "アラートを設定"}
          </h2>
          <button
            className="icon-button"
            aria-label="ダイアログを閉じる"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        {modal === "search" && (
          <>
            <div className="search-field">
              <Search size={17} />
              <input
                autoFocus
                placeholder="商品名・コードで検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="search-results">
              {data.instruments
                .filter((i) =>
                  (i.name + i.symbol)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((i) => (
                  <div className="search-result" key={i.id}>
                    <span
                      className="instrument-icon"
                      style={{ background: i.color + "18", color: i.color }}
                    >
                      {i.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{i.name}</strong>
                      <small>
                        {i.symbol} · {labels[i.origin]}
                      </small>
                    </div>
                    <button
                      className={i.watched ? "secondary" : "primary"}
                      disabled={busy || !!i.watched}
                      onClick={() => {
                        setChosen(i.id);
                        void act({ action: "watch", id: i.id, enabled: true });
                      }}
                    >
                      {i.watched ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                ))}
            </div>
            <small>
              実銘柄を探すには、設定から銘柄マスターを同期してください。
            </small>
          </>
        )}
        {modal === "evaluate" && current && (
          <>
            <label>
              対象商品
              <select
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                {data.instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {evalForm(current)}
          </>
        )}
        {modal === "csv" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act({
                action: "csv",
                name: f.get("name"),
                text: f.get("text"),
              });
            }}
          >
            <label>
              商品名
              <input name="name" required placeholder="分析したい商品名" />
            </label>
            <label>
              CSV内容
              <textarea
                name="text"
                required
                rows={7}
                placeholder={
                  "date,open,high,low,close,volume\n2026-09-01,100,110,95,105,1000"
                }
              />
            </label>
            <p className="muted tiny">
              JPY・売買単位1。日足データ、最大10,000行。上記の6列順に指定してください。取り込んだ過去データの取得時刻は現在時刻になります。
            </p>
            <button className="primary" disabled={busy}>
              取り込む
            </button>
          </form>
        )}
        {modal === "alert" && current && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act({
                action: "alert",
                id: f.get("id"),
                type: f.get("type"),
                threshold: f.get("threshold"),
              });
            }}
          >
            <label>
              商品
              <select name="id" defaultValue={current.id}>
                {data.instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              条件
              <select name="type">
                <option value="above">価格が設定値以上</option>
                <option value="below">価格が設定値以下</option>
                <option value="positive">
                  業績改善評価の確信度が設定値以上
                </option>
              </select>
            </label>
            <label>
              しきい値（価格は円 / 確信度は0〜1）
              <input
                name="threshold"
                type="number"
                step="any"
                min="0"
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              条件を保存
            </button>
          </form>
        )}
        {modal === "paper" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act({ action: "paper", ...Object.fromEntries(f) });
            }}
          >
            <label>
              比較運用名
              <input
                name="name"
                defaultValue="マイ戦略"
                maxLength={60}
                required
              />
            </label>
            <div className="form-grid">
              <label>
                仮想資金（円）
                <input
                  name="cash"
                  type="number"
                  min="10000"
                  max="1000000000"
                  defaultValue="1000000"
                  required
                />
              </label>
              <label>
                1商品への最大配分（0〜1）
                <input
                  name="allocation"
                  type="number"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  defaultValue="0.2"
                  required
                />
              </label>
              <label>
                日次損失停止（%）
                <input
                  name="stopLoss"
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  defaultValue="2"
                  required
                />
              </label>
              <label>
                対象データ
                <select name="origin">
                  <option value="demo">デモ</option>
                  <option value="csv">CSV</option>
                  <option value="jquants">J-Quants</option>
                </select>
              </label>
              <label>
                片道手数料（bps）
                <input
                  name="fee"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="5"
                  required
                />
              </label>
              <label>
                片道スリッページ（bps）
                <input
                  name="slippage"
                  type="number"
                  min="0"
                  max="500"
                  defaultValue="10"
                  required
                />
              </label>
            </div>
            <small>
              1 bps =
              0.01%。同額の仮想資金で2口座を作成します。Jevありは、直近7日以内の業績改善評価がある商品を候補にします。
            </small>
            <button className="primary" disabled={busy}>
              比較運用を作成する
            </button>
          </form>
        )}
      </dialog>
    </div>
  );
}
function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const keys = rows.length ? Object.keys(rows[0]) : ["id", "price", "quantity"];
  const escape = (v: unknown) =>
    '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.join(","),
          ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
        ].join("\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function CompareChart({ items }: { items: Item[] }) {
  if (!items.length)
    return (
      <Empty
        title="比較する商品を選んでください"
        body="同じ起点からの変化を確認できます。"
      />
    );
  const dates = items[0].bars
    .map((b) => b.date)
    .filter((d) => items.every((i) => i.bars.some((b) => b.date === d)))
    .slice(-90);
  if (dates.length < 2)
    return (
      <Empty
        title="共通する価格データが不足しています"
        body="各商品の価格データを更新してください。"
      />
    );
  const series = items.map((i) => {
    const start = Number(i.bars.find((b) => b.date === dates[0])!.close);
    return {
      ...i,
      values: dates.map(
        (d) => (Number(i.bars.find((b) => b.date === d)!.close) / start) * 100,
      ),
    };
  });
  const all = series.flatMap((s) => s.values),
    min = Math.min(...all) - 1,
    max = Math.max(...all) + 1;
  return (
    <>
      <svg
        className="compare-chart"
        viewBox="0 0 900 340"
        role="img"
        aria-label="共通基準日を100とした価格比較"
      >
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line
              x1="50"
              x2="880"
              y1={20 + n * 70}
              y2={20 + n * 70}
              stroke="#edf0eb"
            />
            <text x="0" y={25 + n * 70} fill="#859087" fontSize="13">
              {(max - ((max - min) * n) / 4).toFixed(0)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.id}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            points={s.values
              .map(
                (v, n) =>
                  `${50 + (n / (dates.length - 1)) * 830},${20 + ((max - v) / (max - min)) * 280}`,
              )
              .join(" ")}
          />
        ))}
      </svg>
      <div className="row-between muted tiny">
        <span>{dates[0]}</span>
        <span>{dates.at(-1)}</span>
      </div>
      <div className="compare-legend">
        {series.map((s) => (
          <div key={s.id}>
            <i style={{ background: s.color }} />
            {s.name}
            <strong>{s.values.at(-1)!.toFixed(2)}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
