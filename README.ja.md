# codex-bridge-antigravity

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

公式 Google Antigravity CLI (`agy`) を OpenAI Codex（Desktop および CLI）にシームレスに統合し、ネイティブ GPT モデルのルーティングと認証をそのまま維持する軽量ローカル OpenAI Responses API ブリッジです。

![ネイティブ GPT と Antigravity モデルを表示する Codex モデルメニュー](assets/model-selector.png)

---

## 概要

OpenAI Codex の WebSocket および HTTP エンドポイント設定は、個別モデル単位ではなく **Provider（プロバイダー）単位** で行われます。そのため、`codex-bridge-antigravity` はローカルマシン上でスマートなリバースプロキシ／ルーターとして動作します：

- **ネイティブ GPT / Codex モデル**：公式の ChatGPT / Codex バックエンドへそのまま転送され、既存の Codex Bearer ログイン認証とセッションが維持されます。
- **Antigravity モデル (`antigravity/*`)**：ローカルルーターがインターセプトし、公式 `agy` CLI の `stream-json` ストリーム実行に変換した上で、標準の OpenAI Responses 形式（SSE/WebSocket）として返却します。

これにより、同一ワークスペースかつ同一の Codex モデルドロップダウンメニューから、GPT と Gemini の各モデルを自在に切り替えて利用できます。

```
┌─────────────────────────────────────────────────────────────┐
│                        Codex Client                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Provider ルート: 127.0.0.1:17842)
┌─────────────────────────────────────────────────────────────┐
│                  codex-bridge-antigravity                   │
│                                                             │
│   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │   ネイティブ GPT / Codex  │   │   antigravity/*     │   │
│   └─────────────┬─────────────┘   └──────────┬──────────┘   │
└─────────────────┼────────────────────────────┼──────────────┘
                  │                            │
                  ▼                            ▼
┌──────────────────────────────────┐   ┌──────────────────────┐
│  公式 OpenAI/ChatGPT バックエンド │   │ Google Antigravity   │
│  (Bearer トークンそのまま透過)   │   │ 公式 CLI (`agy`)     │
└──────────────────────────────────┘   └──────────────────────┘
```

---

## 対応モデル一覧

公式 Google Antigravity CLI (`agy models`) で提供される全 14 モデルを完全サポートしており、Codex のモデルメニューから即座に選択できます：

| プロバイダ / シリーズ | モデルルート (Route) | 表示名 | 推論エフォート (Reasoning) |
|---|---|---|---|
| **Gemini 3.8 Flash** | `antigravity/gemini-3.8-flash-high` | Gemini 3.8 Flash (High) | High (高) |
| | `antigravity/gemini-3.8-flash-medium` | Gemini 3.8 Flash (Medium) | Medium (中) |
| | `antigravity/gemini-3.8-flash-low` | Gemini 3.8 Flash (Low) | Low (低) |
| **Gemini 3.7 Flash** | `antigravity/gemini-3.7-flash-high` | Gemini 3.7 Flash (High) | High (高) |
| | `antigravity/gemini-3.7-flash-medium` | Gemini 3.7 Flash (Medium) | Medium (中) |
| | `antigravity/gemini-3.7-flash-low` | Gemini 3.7 Flash (Low) | Low (低) |
| **Gemini 3.6 Flash** | `antigravity/gemini-3.6-flash-high` | Gemini 3.6 Flash (High) | High (高) |
| | `antigravity/gemini-3.6-flash-medium` | Gemini 3.6 Flash (Medium) | Medium (中) |
| | `antigravity/gemini-3.6-flash-low` | Gemini 3.6 Flash (Low) | Low (低) |
| **Gemini 3.1 Pro** | `antigravity/gemini-3.1-pro-high` | Gemini 3.1 Pro (High) | High (高) |
| | `antigravity/gemini-3.1-pro-low` | Gemini 3.1 Pro (Low) | Low (低) |
| **Anthropic Claude** | `antigravity/claude-sonnet-4-6` | Claude Sonnet 4.6 (Thinking) | 思考モード (Thinking) |
| | `antigravity/claude-opus-4-6-thinking` | Claude Opus 4.6 (Thinking) | 思考モード (Thinking) |
| **オープンソース** | `antigravity/gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | Medium (中) |

---

## 主な特徴

- **完全共存**：ネイティブ GPT モデルは公式バックエンドへ直結され、Antigravity 側に送信されることはありません。
- **全 14 モデルの動的カタログ同期**：`agy models` から利用可能なモデル（Gemini Flash/Pro、Claude、GPT-OSS）をリアルタイムで取得・統合します。
- **Codex モデル切り替えエラーの解消**：モデル定義の `use_responses_lite = false` を適用し、Codex クライアントでのモデル切り替え時の検証エラーを防止します。
- **会話履歴の自動要約（Compaction）対応**：OpenAI Compact API 仕様に準拠した `/v1/responses/compact` エンドポイントを実装し、コンテキスト上限に近づいた際の自動要約がスムーズに機能します。
- **ワンコマンドでの設定と簡単トグル**：`setup` により `~/.codex/config.toml` を自動バックアップした上で設定し、いつでもワンコマンドで元の設定と Antigravity 設定をトグル切り替えできます。

### 画像入力

Antigravity モデルのルートは `input_modalities: ["text", "image"]` を宣言します。ローカル画像は `~/.codex-bridge-antigravity/cache/images` に非公開コピーとして保存され、`agy` が読み取れるようにした上で、メインターンの前に必須の画像確認を実行します。`data:image/...;base64,...`、`file://...`、ローカルファイルパス、HTTPS 画像 URL に対応し、ネイティブ GPT ルートは変更されません。

---

## 前提条件

- **Node.js**：`>= 22.0.0`
- **Google Antigravity CLI (`agy`)**：インストールおよび公式ログイン完了済みであること（`agy models` でモデル一覧が表示できる状態）。
- **OpenAI Codex**：Codex Desktop または Codex CLI がインストールされていること。

---

## クイックスタート（コピペで即実行）

### 1. セットアップの実行

リポジトリをクローンし、Codex へのルート設定とバックグラウンドデーモンの起動を一括で行います：

```bash
git clone https://github.com/Jakevin/codex-bridge-antigravity.git
cd codex-bridge-antigravity

# 環境の診断
node src/cli.mjs doctor

# Codex への自動設定およびバックグラウンドサービス起動
npm run setup
```

### 2. Codex の再起動

**OpenAI Codex Desktop** アプリまたは **Codex CLI** を再起動します。ネイティブ GPT モデルと並んで、全 14 モデルの Antigravity モデルがドロップダウンから選択可能になります！

### 3. 動作確認（任意）

```bash
# 現在のステータスとモデル数を確認
npm run status

# Gemini 3.8 Flash でのテスト
curl http://127.0.0.1:17842/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"antigravity/gemini-3.8-flash-low","input":"Reply with exactly AGY_OK"}'
```

---

## 設定の簡単切り替え（元の設定 ⇄ Antigravity 設定）

元のネイティブ Codex 設定と Antigravity 設定は、いつでも手軽に切り替えることができます。

### 🔄 ワンコマンドでのトグル切り替え（Toggle）

現在の設定を自動検知し、もう一方の設定へと瞬時に切り替えます：

```bash
npm run toggle
# または: node src/cli.mjs toggle
```

- **Antigravity モード時**：元の設定を復元し、バックグラウンドサービスを停止します。
- **ネイティブモード時**：Antigravity 設定を有効化し、バックグラウンドサービスを起動します。

### 🎯 個別指定切り替えコマンド

```bash
# Antigravity 設定へ切り替え（ブリッジデーモン起動）
npm run enable
# または: node src/cli.mjs switch antigravity

# 元のネイティブ設定へ切り替え（バックアップを復元しデーモン停止）
npm run disable
# または: node src/cli.mjs switch native
```

### 📊 現在のステータス確認

```bash
npm run status
# または: node src/cli.mjs status
```

### ⚡ シェルから直接ファイル差し替え（Node/NPM 不要）

スクリプトを介さず、任意のターミナルから直接設定ファイルを差し替える場合：

```bash
# 元のネイティブ設定に戻す：
cp ~/.codex-bridge-antigravity/codex/config.toml.before-antigravity ~/.codex/config.toml

# Antigravity 設定に切り替える：
cp ~/.codex-bridge-antigravity/codex/config.toml.antigravity ~/.codex/config.toml
```

> **注意**：設定を切り替えた後は、Codex Desktop アプリまたは CLI を再起動してください。

### 🔌 完全な削除と復元

統合を完全に解除し、バックグラウンドデーモンをアンインストールして元の設定に戻す場合：

```bash
npm run disconnect
# または: node src/cli.mjs disconnect
```

---

## 実行モード

`serve` 起動時に `--mode` オプションで AGY の動作モードを指定できます：

- **`accept-edits`（デフォルト）**：指定したワークスペース内でコーディングツールやファイル編集を自動実行します。
- **`plan`（読み取り専用プランモード）**：ファイルを直接変更せず、設計・調査・計画のみを行います：
  ```bash
  node src/cli.mjs serve --cwd "$PWD" --mode plan
  ```

---

## 環境変数と設定ファイル

設定ファイルはデフォルトで `~/.codex-bridge-antigravity/` に保存されます。

以下の環境変数で設定を上書き可能です：

| 環境変数 | 説明 | デフォルト値 |
|---|---|---|
| `PORT` | ブリッジの HTTP/WebSocket リッスンポート | `17842` |
| `AGY_PATH` | 公式 `agy` 実行バイナリのパス | `$PATH` から自動検出 |
| `CODEX_HOME` | Codex の設定ディレクトリ | `~/.codex` |
| `CODEX_ANTIGRAVITY_HOME` | ブリッジの実行状態保存ディレクトリ | `~/.codex-bridge-antigravity` |

---

## トラブルシューティング

- **Codex でのモデル切り替えエラー (`use_responses_lite`)**：本ブリッジでは `use_responses_lite` を `false` に設定しているため、Codex の検証エラーを回避できます。
- **ポート競合**：もしポート `17842` が他のプロセスによって使用されている場合は、`PORT=17845 node src/cli.mjs serve` のようにポートを変更し、`setup` を再実行してください。
- **AGY 認証切れ**：認証エラーが表示される場合は、ターミナルで `agy auth` を実行し、ブラウザで Google アカウントの再ログインを行ってください。

---

## コンプライアンスと免責事項

`codex-bridge-antigravity` は、開発者がローカル環境 (`localhost`) において自身が所有・認証したツールを連携させるための、独立した非商用の個人開発補助ツールです。

- 本プロジェクトは OpenAI または Google との公式な提携、推奨、支援関係はありません。
- ブリッジを通過するリクエストは、ユーザー自身の認証情報およびアカウント利用枠を使用します。
- マルチテナント公開ホスティング、商用再販、または各社の利用規約に反する不正なモデル蒸留行為への使用は意図されていません。

---

## ライセンス

本プロジェクトは [MIT License](LICENSE) の下で公開されています © 2026 Jakevin
