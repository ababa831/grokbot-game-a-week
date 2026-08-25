# grokbot-game-a-week

[Game A Week](https://www.gamasutra.com/blogs/RamiIsmail/20160715/277591/)（Rami Ismail）にならい、**毎週1本、完成してリリースする**ブラウザゲーム集です。先週のゲームには戻らず、週ごとにフォルダを分けます。

## 遊び方（ローカル）

ビルド不要です。週フォルダの `index.html` をブラウザで開くか、リポジトリルートで静的サーバを立ててください。

```bash
# 例: Python
python -m http.server 8080
# → http://localhost:8080/weeks/2026-w35-hold-orbit/
```

または `weeks/2026-w35-hold-orbit/index.html` を直接開く。

## Weeks

| Week | Title | Path | Notes |
|------|-------|------|-------|
| 2026-W35 | **HOLD ORBIT** | [weeks/2026-w35-hold-orbit/](weeks/2026-w35-hold-orbit/) | [NOTES](weeks/2026-w35-hold-orbit/NOTES.md) |

### 2026-W35 — HOLD ORBIT

小さな機体を操作する。**長押しで最寄り天体に軌道ロック、離してスリングショット**。漂う惑星・デブリ・崩壊する星をかいくぐって生存時間を伸ばす。ベストスコアは `localStorage` に保存。
