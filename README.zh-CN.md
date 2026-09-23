# codex-bridge-antigravity

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

轻量级本地 OpenAI Responses API 桥接器，将 Google Antigravity 官方 CLI (`agy`) 无缝集成至 OpenAI Codex（支持 Desktop 与 CLI），同时完整保留原生 GPT 模型的路由与认证机制。

![Codex 模型菜单显示原生 GPT 与 Antigravity 模型](assets/model-selector.png)

---

## 项目概述

OpenAI Codex 的 WebSocket 与 HTTP 端点配置属于 **Provider 层级**（提供商层级），而非单个模型层级。因此，`codex-bridge-antigravity` 在本地构建了一套智能反向路由器：

- **原生 GPT / Codex 模型**：原样转发至官方 ChatGPT / Codex 后端，沿用您 Codex 现有的 Bearer 登录凭据与 Session。
- **Antigravity 模型（`antigravity/*`）**：由本地路由器拦截，转译为官方 `agy` CLI 命令并以 `stream-json` 事件流方式执行，再包装回标准 OpenAI Responses SSE/WebSocket 格式。

这让您可以在同一工作区以及同一 Codex 模型菜单中，自由无缝地在 GPT 与 Gemini 模型之间切换。

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
│  官方 OpenAI/ChatGPT 后端        │   │ Google Antigravity   │
│  (原生 Bearer Token 透传)        │   │ 官方 CLI (`agy`)     │
└──────────────────────────────────>   └──────────────────────┘
```

---

## 支持的模型列表

完整支持官方 Google Antigravity CLI (`agy models`) 提供的全部 14 款模型，均可在 Codex 模型菜单中自由切换：

| 厂商 / 系列 | 模型标识 (Route) | 显示名称 | 推理级别 (Reasoning) |
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
| **开源模型** | `antigravity/gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | Medium (中) |

---

## 主要特性

- **零干扰双向共存**：原生 GPT 模型依然直连官方后端，完全不会进入 Antigravity。
- **全模型动态目录同步**：自动从 `agy models` 实时读取全部 14 款可用模型（Gemini Flash/Pro、Claude、GPT-OSS）。
- **修复 Codex 切换模型报错**：修复模型目录配置中的 `use_responses_lite = false`，彻底解决切换至 Antigravity 模型时 Codex 前端账号校验崩溃的问题。
- **对话历史压缩（Compaction）**：完整实现 `/v1/responses/compact` 端点，遵循 OpenAI Compact API 规范，对话过长时平滑自动总结。
- **一键配置与快速切换**：`setup` 自动备份原配置并启动后台守护服务；支持随时一键在 原生旧配置 与 Antigravity 配置 间来回切换。

### 图片输入

Antigravity 模型路由会声明 `input_modalities: ["text", "image"]`。本地图片会以私有副本存放在 `~/.codex-bridge-antigravity/cache/images`，供 `agy` 读取，并在主回合前执行必要的图像预检。桥接器支持 `data:image/...;base64,...`、`file://...`、本地文件路径和 HTTPS 图片 URL；原生 GPT 路由保持不变。

---

## 前置要求

- **Node.js**：`>= 22.0.0`
- **Google Antigravity CLI (`agy`)**：已安装并完成官方账号登录（运行 `agy models` 需能列出模型）。
- **OpenAI Codex**：已安装 Codex Desktop 或 Codex CLI。

---

## 快速上手（复制即用）

### 1. 运行安装

克隆本项目，一键写入 Codex 配置并启动后台守护进程：

```bash
git clone https://github.com/Jakevin/codex-bridge-antigravity.git
cd codex-bridge-antigravity

# 检测环境
node src/cli.mjs doctor

# 自动配置 Codex 并启动后台服务
npm run setup
```

### 2. 重启 Codex

重启您的 **OpenAI Codex Desktop** 客户端或 **Codex CLI**。全部 14 款 Antigravity 模型即可在模型下拉菜单中与原生 GPT 模型并排使用！

### 3. 验证（可选）

```bash
# 查看当前状态与模型数量
npm run status

# 测试 Gemini 3.8 Flash 模型连通性
curl http://127.0.0.1:17842/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"antigravity/gemini-3.8-flash-low","input":"Reply with exactly AGY_OK"}'
```

---

## 配置快速切换（原生旧配置 ⇄ Antigravity 配置）

可随时随地自由在 原生旧配置 与 Antigravity 配置 之间往返切换。

### 🔄 单命令一键来回切换（Toggle）

自动检测当前生效的配置并切到另一模式：

```bash
npm run toggle
# 或: node src/cli.mjs toggle
```

- 若当前是 **Antigravity 模式**：自动还原为原生旧配置，并停止后台守护进程。
- 若当前是 **原生模式**：自动启用 Antigravity 配置，并启动后台守护进程。

### 🎯 指定切换命令

```bash
# 切换为 Antigravity 配置（启动桥接服务）
npm run enable
# 或: node src/cli.mjs switch antigravity

# 切换回 原生 / 原始旧配置（恢复备份并停止桥接服务）
npm run disable
# 或: node src/cli.mjs switch native
```

### 📊 查看当前状态

```bash
npm run status
# 或: node src/cli.mjs status
```

### ⚡ 纯 Shell 快速文件替换（无需 Node/NPM）

如需在任意终端直接替换配置文件：

```bash
# 切回 原生 / 旧配置：
cp ~/.codex-bridge-antigravity/codex/config.toml.before-antigravity ~/.codex/config.toml

# 切到 Antigravity 配置：
cp ~/.codex-bridge-antigravity/codex/config.toml.antigravity ~/.codex/config.toml
```

> **提示**：切换配置后请重启 Codex Desktop 或 CLI 以生效。

### 🔌 完全卸载与恢复

彻底解除集成、移除后台服务并还原配置：

```bash
npm run disconnect
# 或: node src/cli.mjs disconnect
```

---

## 运行模式

运行 `serve` 时，可通过 `--mode` 指定 AGY 的工作模式：

- **`accept-edits`（默认）**：AGY 会在指定工作区内自动执行代码修改与工具调用。
- **`plan`（只读规划模式）**：仅进行方案规划与诊断，不修改工作区文件：
  ```bash
  node src/cli.mjs serve --cwd "$PWD" --mode plan
  ```

---

## 环境变量与配置文件

配置文件默认保存在 `~/.codex-bridge-antigravity/`。

可通过以下环境变量自定义路径与端口：

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 桥接器 HTTP/WebSocket 监听端口 | `17842` |
| `AGY_PATH` | 官方 `agy` 可执行文件路径 | 自动从 `$PATH` 查找 |
| `CODEX_HOME` | Codex 配置目录 | `~/.codex` |
| `CODEX_ANTIGRAVITY_HOME` | 桥接器运行时状态目录 | `~/.codex-bridge-antigravity` |

---

## 常见问题与排查

- **Codex 切换模型时报错 (`use_responses_lite`)**：本版本已将模型定义中的 `use_responses_lite` 设为 `false`，避免 Codex upstream 账号校验被拒。
- **端口冲突**：如果 `17842` 端口被其他本地代理占用，可指定 `PORT=17845 node src/cli.mjs serve` 并重新执行 `setup`。
- **AGY 认证失效**：如果收到认证错误提示，请在终端运行 `agy auth` 在浏览器中重新登录 Google 账号。

---

## 合规与免责声明

`codex-bridge-antigravity` 是一个独立的、非商业性质的个人本地开发辅助工具，供开发者在本地 (`localhost`) 串接自己拥有合法授权的账号与凭证。

- 本项目与 OpenAI 或 Google 无任何官方隶属、背书或赞助关系。
- 通过桥接器发送的所有请求，均消耗使用者自己的账户凭证与配额。
- 请勿将本工具用于多租户公网部署、商业转售、或违反平台服务条款的未授权模型蒸馏抓取。

---

## 开源协议

本项目采用 [MIT License](LICENSE) 授权 © 2026 Jakevin
