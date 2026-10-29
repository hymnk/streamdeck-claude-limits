# Claude Limits for Stream Deck

Claude の利用枠(Session = 5時間枠 / Week = 7日枠)の使用率と、リセットまでの残り時間を Stream Deck のキーに表示するプラグインです(Windows)。

## 表示

- **Session / Week** — 1キーに1つの枠を大きく表示(スパーク + ラベル、パーセント、残り時間入りのバー)
- **両方** — 1キーに Session と Week を2段で表示
- バーの色は使用率で変化: 70%未満 = Claude オレンジ、70%以上 = 黄、90%以上 = 赤
- スパークがグレーのときは、取得に失敗して前回の値を表示中
- キーを押すとすぐ再取得(通常は5分ごと。取得制限中は最大30分まで間隔を延長)

キーごとに Property Inspector で「表示する枠」と「使用率 / 残量」を切り替えられます。

## 仕組み

Claude Code のログイン情報 `%USERPROFILE%\.claude\.credentials.json`(`CLAUDE_CONFIG_DIR` があればそちら)を読み、`https://api.anthropic.com/api/oauth/usage` から利用状況を取得します。

Claude デスクトップアプリ内で Claude Code を使っている場合、このファイルのアクセストークンは更新されず数時間で期限切れになります。そのためプラグインは期限切れ時に Claude Code CLI と同じ方法(リフレッシュトークン)でトークンを更新し、新しいトークンをファイルに書き戻します。CLI 版の `claude` も同じファイルをそのまま使い続けられます。

キーに「未ログイン」「要ログイン」と出た場合は、ターミナルで `claude` を起動して `/login` してください。

> 利用している usage エンドポイントは非公開 API のため、仕様変更で動かなくなる可能性があります。

## ビルド

Node.js 20+ と [Stream Deck CLI](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started) が必要です。

```bash
npm install
npm run build
streamdeck link com.hymnk.claudelimits.sdPlugin
streamdeck restart com.hymnk.claudelimits
```

- `npm run preview` — 全レイアウト・状態のキー画像を `dist/preview.html` と `dist/svg/` に出力
- `python scripts/qt-render.py` — `dist/svg/` を Stream Deck と同じ Qt の SVG エンジンで描画して `dist/qt-preview.png` に出力(要 `pip install PySide6-Essentials`)。ブラウザと Qt ではフォントの解釈が違うため、見た目の最終確認はこちらで行う
- `npm run icons` — アイコン画像を再生成
- `streamdeck pack com.hymnk.claudelimits.sdPlugin` — 配布用 `.streamDeckPlugin` を作成

## License

MIT
