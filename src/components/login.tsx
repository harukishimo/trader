"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function Login({
  setup = false,
  databaseError = false,
}: {
  setup?: boolean;
  databaseError?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">t</span>trader
          <span className="brand-dot">.</span>
        </div>
        <div className="eyebrow">YOUR PERSONAL MARKET OBSERVATORY</div>
        <h1>投資を、見渡す。</h1>
        <p>
          価格の流れと、情報の意味。
          <br />
          自分のペースで判断するためのワークスペース。
        </p>
        {setup ? (
          <div className="notice">
            Vercelの環境変数にDATABASE_URL（Turso）、DATABASE_AUTH_TOKEN、APP_PASSWORD、SESSION_SECRETを設定し、再デプロイしてください。詳しくはリポジトリのREADMEをご覧ください。
          </div>
        ) : databaseError ? (
          <div className="notice">
            データベースに接続できません。DATABASE_URLとトークン、ネットワーク、スキーマを確認してください。
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await fetch("/api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    password: new FormData(e.currentTarget).get("password"),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                router.push("/");
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "接続に失敗しました。",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              ワークスペースのパスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="パスワードを入力"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "確認中…" : "ワークスペースを開く →"}
            </button>
            <p role="alert" className="negative">
              {error}
            </p>
          </form>
        )}
        <small>Next.js × TypeSafe Jev</small>
      </div>
    </main>
  );
}
