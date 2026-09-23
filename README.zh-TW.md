# codex-bridge-antigravity

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

輕量級本機 OpenAI Responses API 橋接器，將 Google Antigravity 官方 CLI (`agy`) 無縫整合至 OpenAI Codex（支援 Desktop 與 CLI），同時完整保留原生 GPT 模型的路由與認證機制。

![Codex 模型選單顯示原生 GPT 與 Antigravity 模型](assets/model-selector.png)

---

## 專案概述

OpenAI Codex 的 WebSocket 與 HTTP 端點設定屬於 **Provider 層級**（供應商層級），而非個別模型層級。因此，`codex-bridge-antigravity` 在本機建立了一套智慧反向路由器：

- **原生 GPT / Codex 模型**：原樣轉發給官方 ChatGPT / Codex 後端，沿用您 Codex 現有的 Bearer 登入憑證與 Session。
- **Antigravity 模型（`antigravity/*`）**：由本機路由器攔截，轉譯為官方 `agy` CLI 命令並以 `stream-json` 事件串流方式執行，再包裝回標準 OpenAI Responses SSE/WebSocket 格式。

這讓您在同一個工作區與同一個 Codex 模型選單中，能自由且無縫地在 GPT 與 Gemini 模型間切換。

```
┌─────────────────────────────────────────────────────────────┐
│                        Codex Client                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Provider 路由: 127.0.0.1:17842)
┌─────────────────────────────────────────────────────────────┐
│                  codex-bridge-antigravity                   │
│                                                             │
│   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │   原生 GPT / Codex 模型   │   │   antigravity/*     │   │
│   └─────────────┬─────────────┘   └──────────┬──────────┘   │
└─────────────────┼────────────────────────────┼──────────────┘
                  │                            │
                  ▼                            ▼
┌──────────────────────────────────┐   ┌──────────────────────┐
│  官方 OpenAI/ChatGPT 後端        │   │ Google Antigravity   │
│  (原生 Bearer Token 透傳)        │   │ 官方 CLI (`agy`)     │
└──────────────────────────────────┘   └──────────────────────┘
```

---

## 支援的模型清單

完整支援官方 Google Antigravity CLI (`agy models`) 提供的全部 14 款模型，均可在 Codex 模型選單中自由選用：

| 廠商 / 系列 | 模型路徑 (Route) | 顯示名稱 | 推理級別 (Reasoning) |
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
| **Anthropic Claude** | `antigravity/claude-sonnet-4-6` | Claude Sonnet 4.6 (Thinking) | 深度思考 (Thinking) |
| | `antigravity/claude-opus-4-6-thinking` | Claude Opus 4.6 (Thinking) | 深度思考 (Thinking) |
| **開源模型** | `antigravity/gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | Medium (中) |

---

## 主要特點

- **零干擾雙向共存**：原生 GPT 模型依舊直連官方後端，完全不會被傳入 Antigravity。
- **全模型動態目錄同步**：自動從 `agy models` 即時讀取全部 14 款可用模型（Gemini Flash/Pro、Claude、GPT-OSS）。
- **修復 Codex 切換模型錯誤**：修正模型目錄中的 `use_responses_lite = false`，徹底解決切換到 Antigravity 模型時 Codex 前端帳號驗證崩潰的問題。
- **對話歷程壓縮（Compaction）**：完整實作 `/v1/responses/compact` 端點，符合 OpenAI Compact API 規格，對話過長時能自動完成摘要總結。
- **一鍵設定與輕鬆切換**：`setup` 自動備份並設定 `~/.codex/config.toml`；支援隨時一鍵在 原生舊設定 與 Antigravity 設定 之間往返切換。

### 圖片輸入

Antigravity 模型路由會宣告 `input_modalities: ["text", "image"]`。本機圖片會以私有副本存放於 `~/.codex-bridge-antigravity/cache/images`，讓 `agy` 能讀取，並在主要回合前執行必要的讀圖預檢。橋接器支援 `data:image/...;base64,...`、`file://...`、本機檔案路徑與 HTTPS 圖片 URL；原生 GPT 路由維持不變。

---

## 前置需求

- **Node.js**：`>= 22.0.0`
- **Google Antigravity CLI (`agy`)**：已安裝並完成官方帳號登入（執行 `agy models` 需能列出模型）。
- **OpenAI Codex**：已安裝 Codex Desktop 或 Codex CLI。

---

## 快速開始（複製貼上即可執行）

### 1. 執行安裝

複製本專案，一鍵寫入 Codex 設定並啟動背景守護程序：

```bash
git clone https://github.com/Jakevin/codex-bridge-antigravity.git
cd codex-bridge-antigravity

# 檢測環境
node src/cli.mjs doctor

# 自動設定 Codex 並啟動背景服務
npm run setup
```

### 2. 重新啟動 Codex

重新啟動您的 **OpenAI Codex Desktop** 應用程式或 **Codex CLI**。全部 14 款 Antigravity 模型即可在模型下拉選單中與原生 GPT 模型並列選用！

### 3. 驗證（選用）

```bash
# 查看目前狀態與模型數量
npm run status

# 測試 Gemini 3.8 Flash 模型連線
curl http://127.0.0.1:17842/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"antigravity/gemini-3.8-flash-low","input":"Reply with exactly AGY_OK"}'
```

---

## 設定快速切換（原生舊設定 ⇄ Antigravity 設定）

隨時隨地自由在 原生舊設定 與 Antigravity 設定 之間快速切換。

### 🔄 單一指令一鍵來回切換（Toggle）

自動偵測目前生效的設定並切換至另一模式：

```bash
npm run toggle
# 或: node src/cli.mjs toggle
```

- 若目前是 **Antigravity 模式**：自動還原為原生舊設定，並停止背景守護程序。
- 若目前是 **原生模式**：自動啟用 Antigravity 設定，並啟動背景守護程序。

### 🎯 指定切換指令

```bash
# 切換為 Antigravity 設定（啟動橋接服務）
npm run enable
# 或: node src/cli.mjs switch antigravity

# 切換回 原生 / 原始舊設定（復原備份並停止橋接服務）
npm run disable
# 或: node src/cli.mjs switch native
```

### 📊 查看目前狀態

```bash
npm run status
# 或: node src/cli.mjs status
```

### ⚡ 純 Shell 快速檔案替換（無需 Node/NPM）

如需在任意終端機直接替換設定檔：

```bash
# 切回 原生 / 舊設定：
cp ~/.codex-bridge-antigravity/codex/config.toml.before-antigravity ~/.codex/config.toml

# 切到 Antigravity 設定：
cp ~/.codex-bridge-antigravity/codex/config.toml.antigravity ~/.codex/config.toml
```

> **提示**：切換設定後請重新啟動 Codex Desktop 或 CLI 以套用變更。

### 🔌 完全移除與還原

徹底解除整合、移除背景服務並還原設定：

```bash
npm run disconnect
# 或: node src/cli.mjs disconnect
```

---

## 執行模式

執行 `serve` 時，可透過 `--mode` 指定 AGY 的工作模式：

- **`accept-edits`（預設）**：AGY 會在指定工作區內自動執行其程式修改與工具呼叫。
- **`plan`（唯讀規劃模式）**：僅進行規劃與診斷，不更動工作區檔案：
  ```bash
  node src/cli.mjs serve --cwd "$PWD" --mode plan
  ```

---

## 環境變數與設定檔

設定檔案預設存放在 `~/.codex-bridge-antigravity/`。

可透過下列環境變數自訂路徑與連接埠：

| 環境變數 | 說明 | 預設值 |
|---|---|---|
| `PORT` | 橋接器 HTTP/WebSocket 連接埠 | `17842` |
| `AGY_PATH` | 官方 `agy` 執行檔路徑 | 自動從 `$PATH` 搜尋 |
| `CODEX_HOME` | Codex 設定目錄 | `~/.codex` |
| `CODEX_ANTIGRAVITY_HOME` | 橋接器狀態存放目錄 | `~/.codex-bridge-antigravity` |

---

## 常見問題與排除

- **Codex 切換模型時報錯 (`use_responses_lite`)**：本版本已將模型規格中的 `use_responses_lite` 設為 `false`，避免 Codex upstream 驗證被拒絕。
- **連接埠衝突**：若 `17842` 已被其他本機代理（如 Freebuff 或其他服務）佔用，可指定 `PORT=17845 node src/cli.mjs serve`，並重新執行 `setup`。
- **AGY 授權失效**：若收到認證錯誤，請在終端機執行 `agy auth` 於瀏覽器中重新授權 Google 帳號。

---

## 合規與免責聲明

`codex-bridge-antigravity` 是一個獨立、非商業性的個人本機開發輔助工具，旨在供開發者於本機 (`localhost`) 串接自己已獲官方授權之帳號與憑證。

- 本專案與 OpenAI 或 Google 無官方隸屬、背書或贊助關係。
- 透過橋接器傳送的所有請求，均使用使用者自己的憑證與配額。
- 請勿將本工具用於多租戶公開架設、轉售服務、或違反平台服務條款之未授權模型蒸餾與擷取行為。

---

## 授權條款

本專案採用 [MIT License](LICENSE) 授權 © 2026 Jakevin
