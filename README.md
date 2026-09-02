# My Games Hub

自作の簡易ゲーム・アプリを紹介する静的サイト。Firebase Hosting で公開。

## 構成

- `index.html` — トップページ
- `css/style.css` — スタイル
- `js/script.js` — スクリプト
- `games/` — 個別ゲームを追加していくフォルダ(1ゲーム1サブフォルダを想定)

## ローカルで確認

```bash
firebase emulators:start --only hosting
```

## デプロイ

```bash
firebase deploy --only hosting
```
