# trader

Next.js / TypeScriptで作る個人用の投資商品モニターです。ウォッチリスト、価格・出来高チャート、商品比較、TypeSafe Jev評価、画面内アラート、模擬運用をまとめています。

初期状態は架空の商品と合成価格によるデモです。Jevのモック評価はキーワードによる固定ルールであり、実際のJevの出力ではありません。実注文やSBI証券への接続は実装していません。

## 起動

Node.js 22 LTS（22.16以降）とnpmを使用します。`.nvmrc` と `engines` でメジャーバージョンを固定しています。

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

ブラウザで http://127.0.0.1:3000 を開きます。別のターミナルで `npm run worker:dev` を実行すると、画面を閉じても定期処理を継続します。初期設定はローカル接続専用で、パスワードを要求しません。

## 主な機能

- 商品の登録・解除、日足ローソク足、出来高、移動平均、期間比較
- CSV取込、J-Quants V2による銘柄マスター・日足取得アダプター
- 資料テキストを入力するJev評価、入力スナップショットと履歴保存
- 価格・評価条件のアラート、既読管理
- 価格ルールのみ / 価格ルール＋Jevの模擬口座を同じ設定で作成
- 手数料・スリッページを含む模擬約定、台帳、損益、ドローダウン
- 永続ジョブ、ページ単位の再開、同時ワーカーの排他、失敗表示、再試行、バックアップ用CLI
- 実現損益と含み損益の表示、分割・配当がある期間の検証除外

## 構成

```text
ブラウザ → Next.js画面 / 認証付きRoute Handlers
                    ↓
           SQLite（ローカル）/ Turso（Vercel）
                    ↑
    ジョブ実行 → 市場データ / Jev / アラート / 模擬運用
```

`src/core` がDB・計算・外部API・ジョブを扱い、Webとワーカーで共有します。DBは `@libsql/client` のパラメータ付きSQLを利用します。UIは通常のCSSとLightweight Chartsです。設計当初からの変更は [PROJECT.md](PROJECT.md) の冒頭に記録しています。

## Vercelへの配置

1. このGitHubリポジトリをVercelへImportします。Root Directoryはリポジトリ直下、FrameworkはNext.jsです。
2. TursoなどのリモートlibSQL DBを用意します。PreviewとProductionは別のDBを使用してください。VercelのローカルファイルにSQLiteを保存しません。
3. 下の環境変数を設定し、再デプロイします。DBスキーマは最初のアクセス時に初期化されます。手動実行する場合は対象DBの環境変数で `npm run db:migrate` を実行します。
4. ログイン、ウォッチリスト変更、再読込後の保存内容、評価依頼とジョブ完了を確認します。

| 変数                     | 用途                                       |
| ------------------------ | ------------------------------------------ |
| `DATABASE_URL`           | Tursoの `libsql://…` URL。必須             |
| `DATABASE_AUTH_TOKEN`    | 対応DBの認証トークン。必須                 |
| `APP_PASSWORD`           | アプリのログインパスワード。必須           |
| `SESSION_SECRET`         | Cookie署名用の十分長いランダム文字列。必須 |
| `CRON_SECRET`            | 定期処理の認証用ランダム文字列。必須       |
| `APP_MODE`               | 最初は `demo`。実データ利用時は `live`     |
| `JEV_PROVIDER`           | 最初は `mock`。実APIは `typesafe`          |
| `MARKET_DATA_PROVIDER`   | 最初は `demo`。実市場は `jquants`          |
| `TYPESAFE_API_KEY`       | Jev実API利用時に必要                       |
| `TYPESAFE_MODEL`         | 既定値 `jev-latest`                        |
| `JQUANTS_API_KEY`        | J-Quants V2利用時に必要                    |
| `ALLOW_AI_DATA_TRANSFER` | Jevへの外部送信を許可するときだけ `true`   |

Tursoの連携が `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` を発行する場合は、それぞれ上記の `DATABASE_URL` / `DATABASE_AUTH_TOKEN` に設定してください。キーを `NEXT_PUBLIC_` 変数に入れないでください。

環境変数の値を表示せずに設定を検査できます。

```sh
npm run check:env -- --vercel
npm run build
```

`vercel.json` は毎日10:00 UTC（19:00 JST）のCronを定義します。CronはProductionで動作します。Previewでは画面の更新・処理実行を使います。プランによって実行時刻に遅れが生じるため、厳密な時刻の約定には使用しません。

操作後の処理は `after()` で開始し、ジョブ自体はDBに保存します。市場データは1ページずつ処理し、続きのキーをDBに保存します。実行時間に余裕がないときは新しい処理を始めません。価格更新が完了するまでは模擬運用を保留します。同時実行をDBの期限付きロックで抑え、中断した処理は次の実行で回収します。多数の監視銘柄で定期実行の間隔が不足する場合は、同じリモートDBに接続した独立ワーカーを常駐ホストで実行してください。Vercel Cronのみでは即時再試行や常時実行を保証しません。

実API接続には各サービスのキー・契約が必要です。合成データを消さずに実データへ切り替える場合も、データの取得元は区別して表示されます。クリーンな実運用開始には新しいDBを推奨します。

## 検証

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run worker:build
npm run test:production
```

ブラウザテストはデモ専用DBの開発サーバーをポート3017で起動してから実行します。テストはウォッチリスト・評価・口座を変更します。

```sh
npx playwright install chromium
npm run dev -- --port 3017
# 別ターミナル
npm run test:e2e
```

単体・結合テストは一時DBを利用し、Jevの実リクエスト形式はモックHTTPで検証します。有料APIの実通信や実市場での収益性を検証したものではありません。

`test:production` は事前の `build` が必要です。一時DBと一時パスワードで本番サーバーを起動し、未認証アクセス、ログイン、署名改ざん、別Originからの変更、ログアウトを検証します。

## データの保全

```sh
npm run db:backup
# 空のDBをDATABASE_URLに指定して復元
npm run db:restore -- data/backup-xxxxxxxx.json
```

バックアップには評価資料と運用履歴が含まれます。`.env.local`、`data/`、`.vercel/` はGit管理・Vercelへのアップロードから除外しています。一時的なワーカーロックは復元対象に含めません。

## 現時点の制限

- 日足の模擬運用です。注文判断後、利用可能になった翌営業日以降の始値を用います。日足が到着するまで約定を記録しません。
- 過去の成績を再現する完成済みバックテスト機能ではありません。口座作成以降に処理を積み上げます。
- 分割・配当による保有や現金の自動補正には未対応です。J-Quantsの分割等の調整係数を検出し、配当等は設定画面から手動登録できます。該当期間をまたぐ保有・注文がある口座は停止し、成績を「検証対象外」として値を非表示にします。誤記録を削除した後の再開は明示操作です。
- 為替、税金、日本市場の祝日カレンダーには未対応です。J-Quantsの売買単位は現状100株仮定のため、ETFなど単位が異なる商品の模擬成績評価には使わないでください。
- 損失制限に達した口座は処理を停止します。保有商品を自動清算する機能ではありません。再開は画面から明示的に行います。
- 成績は模擬条件の結果であり、実市場での利益を示すものではありません。現段階ではデモでの動作確認と商品の観察を中心に利用してください。
- 個人用の共有パスワード認証です。複数利用者の分離・ロール・パスワード再設定は対象外です。

## 参照

- [TypeSafe Jev](https://docs.typesafe.ai/)
- [J-Quants V2日足仕様](https://jpx-jquants.com/en/spec/eq-bars-daily)
- [Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference)
- [Next.js](https://nextjs.org/docs)
- [Lightweight Charts / TradingView](https://www.tradingview.com/lightweight-charts/)

Lightweight ChartsのTradingView帰属リンクはチャート画面にも表示しています。
