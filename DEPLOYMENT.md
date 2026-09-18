# 配置状況

確認日：2026-09-18

- GitHub: https://github.com/harukishimo/trader
- Vercel Project: https://vercel.com/harukishimos-projects/trader
- Production URL: https://trader-alpha-one.vercel.app

初回デプロイはVercelでREADYになり、設定案内のHTTP 200とDB未設定のヘルス応答を確認済みです。初回のためVercelによりProductionへ割り当てられました。DB接続後のアプリ全体のクラウド検証は未完了です。

GitHub連携と、Production / Preview双方のログイン・セッション・Cron認証およびデモ設定を登録済みです。秘密情報はこのリポジトリに含みません。以後のmainへのpushはProductionのビルドを開始します。

## 残る設定

1. TursoのVercel連携規約に利用者本人が同意する。
2. Preview用DBとProduction用DBを用意し、環境ごとの `DATABASE_URL` / `DATABASE_AUTH_TOKEN` を登録する。
3. 再デプロイ後に、ログイン、商品登録、価格表示、評価、履歴、模擬口座、再読込後の保存状態をクラウドで確認する。
4. 実接続に移る場合は、TypeSafe / J-Quantsの契約とAPIキーを設定して、少数のリクエストで確認する。

規約同意先： https://vercel.com/harukishimos-projects/~/integrations/accept-terms/tursocloud?source=cli

## ローカルで確認したこと

- ESLint、TypeScript型検査、Next.js本番ビルド、ワーカービルド
- 19件の単体・結合テスト（Jev形式・再試行・ジョブ排他・ページ再開・会計・企業行動の除外など）
- 2件のPlaywrightテスト（主要画面・保存・モバイル・Origin/Cron認証）
- 本番起動での認証テスト（成功/失敗、Cookie属性、署名改ざん拒否、CSRF拒否、no-store、ログアウト）
- DBバックアップを別ファイルへ復元し、16テーブルの全保存値が一致
- ビルド済み独立ワーカーの起動とSIGTERMでの終了

これらはクラウドDBや実APIの接続試験を代替しません。機能と現時点の制限は [README.md](README.md)、当初の実装目標は [PROJECT.md](PROJECT.md) にあります。
