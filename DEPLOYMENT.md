# 配置状況

確認日：2026-09-18

- GitHub: https://github.com/harukishimo/trader
- Vercel Project: https://vercel.com/harukishimos-projects/trader
- Production URL: https://trader-alpha-one.vercel.app

Production / PreviewをTursoに接続し、両環境でクラウド上の保存・再読込まで確認しました。確認したアプリコードは `fa4aad2` です。

- Production deployment: https://trader-nf8kr2mj5-harukishimos-projects.vercel.app
- Preview deployment: https://trader-93nfilmbg-harukishimos-projects.vercel.app
- Production DB: `trader-production`
- Preview DB: `trader-preview`

両DBのスキーマ作成・デモデータ投入が成功しています。Previewの評価IDがProductionに存在しないことを直接確認し、DBの分離も検証しました。

GitHub連携と、Production / Preview双方のログイン・セッション・Cron認証およびデモ設定を登録済みです。秘密情報はこのリポジトリに含みません。以後のmainへのpushはProductionのビルドを開始します。

## クラウドで確認したこと

- ヘルスチェックHTTP 200、未認証のデータ取得HTTP 401、ログイン成功
- ウォッチリストの保存と再読込、本番ブラウザでの商品追加と表示
- 模擬Jev評価の完了、入力と評価履歴の保存、本番ブラウザでの履歴表示
- 同一設定の比較用模擬口座2つの作成・一時停止
- 価格アラートの保存
- Cronの未認証拒否と、正しい認証による処理実行
- 新しいログインセッションで評価・口座・アラートを再取得
- 本番ブラウザのJavaScriptエラーなし。対象デプロイの直近30分のエラーレベルログ検索は0件

動作確認用の模擬口座は「クラウド動作確認（デモ）」という名前で一時停止しています。実注文は行っていません。

## 実APIへ切り替える場合

現在は `APP_MODE=demo`、`JEV_PROVIDER=mock`、`MARKET_DATA_PROVIDER=demo` です。価格と評価は合成データです。TypeSafe / J-Quantsの契約済みキーを設定し、READMEの切替手順に沿って少数のリクエストで実接続を確認してください。実APIの課金通信、実市場の収益性、SBI証券の注文接続は今回のクラウド確認対象に含めていません。

## ローカルで確認したこと

- ESLint、TypeScript型検査、Next.js本番ビルド、ワーカービルド
- 22件の単体・結合テスト（Turso設定・Jev形式・再試行・ジョブ排他・ページ再開・会計・企業行動の除外など）
- 2件のPlaywrightテスト（主要画面・保存・モバイル・Origin/Cron認証）
- 本番起動での認証テスト（成功/失敗、Cookie属性、署名改ざん拒否、CSRF拒否、no-store、ログアウト）
- DBバックアップを別ファイルへ復元し、16テーブルの全保存値が一致
- ビルド済み独立ワーカーの起動とSIGTERMでの終了

機能と現時点の制限は [README.md](README.md)、当初の実装目標は [PROJECT.md](PROJECT.md) にあります。
