# GTFSバス停時刻表作成ツール（MVP）

GTFS ZIPを読み込み、指定したバス停・乗り場の時刻表をA4縦で印刷・PDF保存するWebアプリです。
GTFSはブラウザ内だけで処理し、外部には送信しません。

## 開発

```bash
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # dist/ に出力
```

## デプロイ

mainへpushすると、GitHub Actionsがテスト・ビルドを行い、GitHub Pagesへ公開します。
初回のみ、Settings → Pages → Source を「GitHub Actions」にしてください。

## 構成

- `src/gtfs/` GTFS解析・運行日判定・時刻表生成（画面に依存しない）
- `src/components/` 表示・印刷
- `tests/` 運行日判定・時刻表生成のテスト

## 注意

- 掲示前に、必ず担当者が最新の運行情報と照合してください。
- 未公開のGTFS ZIPをリポジトリにコミットしないでください（`.gitignore` で `*.zip` を除外しています）。