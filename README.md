# codex-bridge-antigravity

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

A lightweight local OpenAI Responses API bridge that seamlessly integrates the official Google Antigravity CLI (`agy`) into OpenAI Codex (Desktop & CLI), while preserving native GPT model routing and authentication.

![Codex model picker showing native GPT and Antigravity models](assets/model-selector.png)

---

## Overview

OpenAI Codex configures WebSocket and HTTP endpoints at the provider level rather than per model. `codex-bridge-antigravity` installs a smart local reverse proxy/router on your machine:

- **Native GPT/Codex Models**: Forwarded untouched to the official OpenAI/ChatGPT backend, preserving your existing Codex Bearer login and session.
- **Antigravity Models (`antigravity/*`)**: Intercepted locally, transformed into official `agy` CLI executions using `stream-json` event streaming, and returned as standard OpenAI Responses SSE/WebSocket streams.

This allows you to seamlessly switch between GPT and Gemini models directly from the Codex model picker dropdown within the exact same workspace.

```
┌─────────────────────────────────────────────────────────────┐
│                        Codex Client                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Provider Route: 127.0.0.1:17842)
┌─────────────────────────────────────────────────────────────┐
│                  codex-bridge-antigravity                   │
│                                                             │
│   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │   Native GPT / Codex      │   │   antigravity/*     │   │
│   └─────────────┬─────────────┘   └──────────┬──────────┘   │
└─────────────────┼────────────────────────────┼──────────────┘
                  │                            │
                  ▼                            ▼
┌──────────────────────────────────┐   ┌──────────────────────┐
│  Official OpenAI/ChatGPT Backend │   │ Google Antigravity   │
│  (Bearer Token Passthrough)      │   │ CLI (`agy`)          │
└──────────────────────────────────┘   └──────────────────────┘
```

---

## Supported Models

All models from the official Google Antigravity CLI (`agy models`) are supported out of the box and seamlessly selectable in Codex:

| Provider / Family | Model Route | Display Name | Reasoning Effort |
|---|---|---|---|
| **Gemini 3.8 Flash** | `antigravity/gemini-3.8-flash-high` | Gemini 3.8 Flash (High) | High |
| | `antigravity/gemini-3.8-flash-medium` | Gemini 3.8 Flash (Medium) | Medium |
| | `antigravity/gemini-3.8-flash-low` | Gemini 3.8 Flash (Low) | Low |
| **Gemini 3.7 Flash** | `antigravity/gemini-3.7-flash-high` | Gemini 3.7 Flash (High) | High |
| | `antigravity/gemini-3.7-flash-medium` | Gemini 3.7 Flash (Medium) | Medium |
| | `antigravity/gemini-3.7-flash-low` | Gemini 3.7 Flash (Low) | Low |
| **Gemini 3.6 Flash** | `antigravity/gemini-3.6-flash-high` | Gemini 3.6 Flash (High) | High |
| | `antigravity/gemini-3.6-flash-medium` | Gemini 3.6 Flash (Medium) | Medium |
| | `antigravity/gemini-3.6-flash-low` | Gemini 3.6 Flash (Low) | Low |
| **Gemini 3.1 Pro** | `antigravity/gemini-3.1-pro-high` | Gemini 3.1 Pro (High) | High |
| | `antigravity/gemini-3.1-pro-low` | Gemini 3.1 Pro (Low) | Low |
| **Anthropic Claude** | `antigravity/claude-sonnet-4-6` | Claude Sonnet 4.6 (Thinking) | Thinking |
| | `antigravity/claude-opus-4-6-thinking` | Claude Opus 4.6 (Thinking) | Thinking |
| **Open Source** | `antigravity/gpt-oss-120b-medium` | GPT-OSS 120B (Medium) | Medium |

---

## Key Features

- **Zero-Disruption Coexistence**: Native GPT models continue working via official OpenAI endpoints without touching Antigravity.
- **Dynamic Model Catalog**: Automatically synchronizes all 14 models from `agy models` (Gemini Flash/Pro, Claude, GPT-OSS).
- **Codex Switcher Compatibility**: Configured with `use_responses_lite = false` to eliminate upstream account validation failures when switching models in Codex.
- **Compaction & History Support**: Full `/v1/responses/compact` handler adhering to OpenAI Compact specifications, enabling seamless automatic conversation compaction.
- **Single-Command Setup & Easy Toggle**: Safely patches `~/.codex/config.toml` with backup, offers 1-command toggle between native and Antigravity configs, and clean rollback via `disconnect`.

### Image Input

Antigravity model routes advertise `input_modalities: ["text", "image"]`. Local images are stored as private copies under `~/.codex-bridge-antigravity/cache/images`, made readable by `agy`, and inspected in a required image preflight before the main turn. The bridge recognizes `data:image/...;base64,...`, `file://...`, local file paths, and HTTPS image URLs; native GPT routes remain unchanged.

---

## Prerequisites

- **Node.js**: `>= 22.0.0`
- **Google Antigravity CLI (`agy`)**: Installed and authenticated (`agy models` must list available models).
- **OpenAI Codex**: Desktop app or CLI installed.

---

## Quick Start (Copy & Paste)

### 1. Run Setup

Clone and install the bridge into Codex with automatic background service:

```bash
git clone https://github.com/Jakevin/codex-bridge-antigravity.git
cd codex-bridge-antigravity

# Verify prerequisites and AGY CLI
node src/cli.mjs doctor

# Install route into ~/.codex/config.toml and start background daemon
npm run setup
```

### 2. Restart Codex

Restart your **OpenAI Codex Desktop** app or restart your **Codex CLI**. All 14 Antigravity models now appear in your model dropdown list!

### 3. Verify (Optional)

Test a direct response or check status:

```bash
# Check status and active configuration
npm run status

# Direct response test with Gemini 3.8 Flash
curl http://127.0.0.1:17842/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"antigravity/gemini-3.8-flash-low","input":"Reply with exactly AGY_OK"}'
```

---

## Easy Config Switching (Old / Native ⇄ Antigravity)

Easily switch between your original native Codex configuration and the Antigravity configuration at any time.

### 🔄 One-Command Toggle (Flip Back and Forth)

Automatically detects your active configuration and switches to the other:

```bash
npm run toggle
# or: node src/cli.mjs toggle
```

- When in **Antigravity mode**: Restores original config and stops the background service.
- When in **Native mode**: Activates Antigravity config and starts the background service.

### 🎯 Explicit Switch Commands

```bash
# Switch to Antigravity configuration (starts bridge daemon)
npm run enable
# or: node src/cli.mjs switch antigravity

# Switch back to Old / Native configuration (restores backup & stops daemon)
npm run disable
# or: node src/cli.mjs switch native
```

### 📊 Check Current Status

```bash
npm run status
# or: node src/cli.mjs status
```

### ⚡ Direct Shell Copy-Paste (No Node/NPM required)

For instant swapping from any terminal without running scripts:

```bash
# Switch to Old / Native config:
cp ~/.codex-bridge-antigravity/codex/config.toml.before-antigravity ~/.codex/config.toml

# Switch to Antigravity config:
cp ~/.codex-bridge-antigravity/codex/config.toml.antigravity ~/.codex/config.toml
```

> **Note**: Restart your Codex Desktop app or CLI after toggling configs to apply changes.

### 🔌 Complete Disconnect & Restore

To completely remove the integration, uninstall the background service, and restore your pre-setup Codex config:

```bash
npm run disconnect
# or: node src/cli.mjs disconnect
```

---

## Execution Modes

When running `serve` manually in foreground, you can specify the tool execution mode:

- **`accept-edits` (Default)**: AGY executes coding tools directly inside your specified working directory.
- **`plan`**: Read-only planning mode for inspection and analysis without writing file changes:
  ```bash
  node src/cli.mjs serve --cwd "$PWD" --mode plan
  ```

---

## Configuration & Environment Variables

The default configuration file is saved in `~/.codex-bridge-antigravity/`.

You can override paths and ports using environment variables:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Bridge HTTP/WebSocket listening port | `17842` |
| `AGY_PATH` | Path to the official `agy` executable | Discovered from `$PATH` |
| `CODEX_HOME` | Codex configuration directory | `~/.codex` |
| `CODEX_ANTIGRAVITY_HOME` | Bridge runtime state directory | `~/.codex-bridge-antigravity` |

---

## Troubleshooting

- **Model Switcher Error (`use_responses_lite`)**: If you experience an error when selecting an Antigravity model in Codex, ensure you are running this bridge where `use_responses_lite` is set to `false`.
- **Port Conflicts**: If port `17842` is occupied by another process, specify `PORT=17845 node src/cli.mjs serve` and update setup accordingly.
- **Authentication Expired**: If AGY returns an authentication error, re-run `agy auth` in your browser to refresh your Google session.

---

## Compliance & Disclaimer

`codex-bridge-antigravity` is an independent, non-commercial personal productivity tool designed for individual developers to connect their own locally authenticated tools on `localhost`.

- This project is not affiliated with, endorsed by, or sponsored by OpenAI or Google.
- Requests sent through this bridge use your own local authentication and existing account quotas.
- Not intended for multi-tenant hosting, public proxying, commercial resale, or unauthorized model distillation.

---

## License

[MIT](LICENSE) © 2026 Jakevin
