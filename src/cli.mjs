#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agyVersion } from "./agy.mjs";
import {
  antigravityCodexConfigPath,
  appHome,
  backupCodexConfigPath,
  catalogPath,
  codexConfigPath,
  integrationStatePath,
  loadConfig,
  resolveAgyExecutable,
  resolveCwd,
  saveConfig,
} from "./config.mjs";
import { buildCodexCatalog, discoverAgyModels } from "./models.mjs";
import { createBridgeServer, listenBridge } from "./server.mjs";
import { installService, isServiceRunning, restartService, startService, stopService, uninstallService } from "./service.mjs";

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inline] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inline !== undefined) options[key] = inline;
    else if (args[index + 1] && !args[index + 1].startsWith("--")) options[key] = args[++index];
    else options[key] = true;
  }
  return { options, positional };
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function freshConfig(options) {
  const existing = loadConfig();
  const config = {
    ...existing,
    ...(options.cwd ? { cwd: resolveCwd(options.cwd) } : {}),
    ...(options.port ? { port: numberOption(options.port, existing.port) } : {}),
    ...(options.mode && ["plan", "accept-edits"].includes(options.mode) ? { mode: options.mode } : {}),
    agyPath: resolveAgyExecutable(options.agyPath || existing.agyPath),
  };
  return config;
}

async function refreshModels(config) {
  try {
    const models = await discoverAgyModels(config.agyPath);
    const updated = { ...config, models, lastModelsRefresh: new Date().toISOString() };
    saveConfig(updated);
    return updated;
  } catch (error) {
    if (config.models?.length) return config;
    throw error;
  }
}

function topLevelEnd(lines) {
  const index = lines.findIndex(line => /^\s*\[/.test(line));
  return index < 0 ? lines.length : index;
}

function getTopLevelAssignment(text, key) {
  const lines = text.split(/\r?\n/);
  const end = topLevelEnd(lines);
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*(.+?)\\s*$`);
  for (let index = 0; index < end; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    try { return JSON.parse(match[1]); } catch { return match[1].replace(/^['"]|['"]$/g, ""); }
  }
  return undefined;
}

function replaceTopLevelAssignment(text, key, value) {
  const lines = text.split(/\r?\n/);
  const end = topLevelEnd(lines);
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=`);
  const rendered = `${key} = ${JSON.stringify(value)}`;
  for (let index = 0; index < end; index += 1) {
    if (pattern.test(lines[index])) {
      lines[index] = rendered;
      return lines.join("\n");
    }
  }
  lines.splice(end, 0, rendered);
  return lines.join("\n");
}

function providerSection(text, provider) {
  if (!provider || !/^[A-Za-z0-9_-]+$/.test(provider)) return undefined;
  const lines = text.split(/\r?\n/);
  const header = `[model_providers.${provider}]`;
  const start = lines.findIndex(line => line.trim() === header);
  if (start < 0) return undefined;
  const next = lines.slice(start + 1).findIndex(line => /^\s*\[/.test(line));
  return { lines, start, end: next < 0 ? lines.length : start + 1 + next };
}

function replaceProviderBaseUrl(text, provider, value) {
  const section = providerSection(text, provider);
  if (!section) return text;
  const pattern = /^\s*base_url\s*=/;
  const rendered = `base_url = ${JSON.stringify(value)}`;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (pattern.test(section.lines[index])) {
      section.lines[index] = rendered;
      return section.lines.join("\n");
    }
  }
  section.lines.splice(section.end, 0, rendered);
  return section.lines.join("\n");
}

function replaceProviderBoolean(text, provider, key, value) {
  const section = providerSection(text, provider);
  if (!section) return text;
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=`);
  const rendered = `${key} = ${value ? "true" : "false"}`;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (pattern.test(section.lines[index])) {
      section.lines[index] = rendered;
      return section.lines.join("\n");
    }
  }
  section.lines.splice(section.end, 0, rendered);
  return section.lines.join("\n");
}

function ensureRouterProvider(text, provider, route) {
  const name = provider || "antigravity-router";
  let patched = provider ? text : replaceTopLevelAssignment(text, "model_provider", name);
  if (!providerSection(patched, name)) {
    const suffix = `\n[model_providers.${name}]\nname = "Antigravity router"\nrequires_openai_auth = true\nsupports_websockets = true\nwire_api = "responses"\nbase_url = ${JSON.stringify(route)}\n`;
    return `${patched.trimEnd()}${suffix}`;
  }
  patched = replaceProviderBaseUrl(patched, name, route);
  patched = replaceProviderBoolean(patched, name, "requires_openai_auth", true);
  patched = replaceProviderBoolean(patched, name, "supports_websockets", true);
  return patched;
}

function atomicWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, data, { mode: 0o600 });
  writeFileSync(path, readFileSync(temporary), { mode: 0o600 });
  unlinkSync(temporary);
}

async function setup(options) {
  let config = await freshConfig(options);
  config = await refreshModels(config);
  const route = `http://${config.host}:${config.port}/v1`;
  const configPath = codexConfigPath();
  const configExists = existsSync(configPath);
  const currentText = configExists ? readFileSync(configPath, "utf8") : "";
  const currentRoute = getTopLevelAssignment(currentText, "openai_base_url");
  const provider = getTopLevelAssignment(currentText, "model_provider");
  const providerRoute = providerSection(currentText, provider)?.lines
    .slice(providerSection(currentText, provider).start + 1, providerSection(currentText, provider).end)
    .find(line => /^\s*base_url\s*=/.test(line))?.split("=", 2)[1]?.trim().replace(/^['"]|['"]$/g, "");
  const statePath = integrationStatePath();
  const existingState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
  const routeInUse = currentRoute || providerRoute;
  if (routeInUse && routeInUse !== route && options.replaceCodexRoute !== true) {
    throw new Error(`Codex already routes through ${routeInUse}. Use --replace-codex-route to switch it reversibly.`);
  }

  const backupPath = existingState?.backupPath || backupCodexConfigPath();
  if (!existingState && configExists) {
    mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
    copyFileSync(configPath, backupPath);
    chmodSync(backupPath, 0o600);
  }
  const managedCatalog = buildCodexCatalog(config.models);
  const managedCatalogPath = catalogPath();
  atomicWrite(managedCatalogPath, `${JSON.stringify(managedCatalog, null, 2)}\n`);
  let patched = replaceTopLevelAssignment(currentText, "openai_base_url", route);
  patched = replaceTopLevelAssignment(patched, "model_catalog_json", managedCatalogPath);
  // Codex chooses the Responses transport per provider, not per catalog row. The local router
  // therefore accepts WebSocket requests and decides by model: native GPT frames are forwarded
  // to ChatGPT, while antigravity/* frames are translated to AGY CLI turns.
  patched = ensureRouterProvider(patched, provider, route);
  atomicWrite(configPath, patched);
  atomicWrite(antigravityCodexConfigPath(), patched);
  const state = {
    version: 1,
    active: "antigravity",
    configPath,
    route,
    catalogPath: managedCatalogPath,
    hadConfig: configExists,
    backupPath: configExists && existsSync(backupPath) ? backupPath : null,
    antigravityConfigPath: antigravityCodexConfigPath(),
    installedAt: existingState?.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
  saveConfig(config);
  const service = installService(config);
  console.log(`Codex route installed: ${route}`);
  console.log(`Models installed: ${config.models.length}`);
  if (service.installed) console.log(`Background service installed: ${service.plistPath}`);
  console.log(`Codex restart required. To toggle/switch config: codex-bridge-antigravity toggle`);
  console.log(`To restore the previous route: codex-bridge-antigravity disconnect`);
}

export function isAntigravityActive() {
  const configPath = codexConfigPath();
  if (!existsSync(configPath)) return false;
  const currentText = readFileSync(configPath, "utf8");
  const currentRoute = getTopLevelAssignment(currentText, "openai_base_url");
  const provider = getTopLevelAssignment(currentText, "model_provider");
  if (provider === "antigravity-router") return true;
  if (typeof currentRoute === "string" && (currentRoute.includes(":17842") || currentRoute.includes("/v1"))) {
    return true;
  }
  return false;
}

export async function switchToNative() {
  const configPath = codexConfigPath();
  const backupPath = backupCodexConfigPath();
  const statePath = integrationStatePath();
  const existingState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
  const resolvedBackup = existingState?.backupPath || backupPath;

  if (existsSync(configPath) && isAntigravityActive()) {
    atomicWrite(antigravityCodexConfigPath(), readFileSync(configPath, "utf8"));
  }

  if (existsSync(resolvedBackup)) {
    copyFileSync(resolvedBackup, configPath);
    console.log(`✓ Restored native Codex configuration from ${resolvedBackup}`);
  } else if (existingState && !existingState.hadConfig && existsSync(configPath)) {
    unlinkSync(configPath);
    console.log("✓ Removed Codex configuration created by Antigravity setup");
  } else {
    throw new Error(`Backup configuration not found at ${resolvedBackup}`);
  }

  stopService();
  console.log("✓ Stopped Antigravity background service");

  if (existingState) {
    existingState.active = "native";
    existingState.switchedAt = new Date().toISOString();
    atomicWrite(statePath, `${JSON.stringify(existingState, null, 2)}\n`);
  }

  console.log("\nCodex is now using Native / Original configuration (direct OpenAI/ChatGPT routing).");
  console.log("Restart Codex Desktop or CLI to apply changes.");
}

export async function switchToAntigravity(options = {}) {
  const statePath = integrationStatePath();
  const antigravityConfig = antigravityCodexConfigPath();
  const configPath = codexConfigPath();

  if (!existsSync(statePath) || !existsSync(antigravityConfig)) {
    console.log("Setting up Antigravity integration...");
    return setup({ ...options, replaceCodexRoute: true });
  }

  let config = await freshConfig(options);
  config = await refreshModels(config);
  const managedCatalog = buildCodexCatalog(config.models);
  atomicWrite(catalogPath(), `${JSON.stringify(managedCatalog, null, 2)}\n`);

  if (existsSync(configPath) && !isAntigravityActive()) {
    const backupPath = backupCodexConfigPath();
    if (!existsSync(backupPath)) {
      mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
      copyFileSync(configPath, backupPath);
      chmodSync(backupPath, 0o600);
    }
  }

  copyFileSync(antigravityConfig, configPath);
  console.log("✓ Activated Antigravity Codex configuration");

  restartService();
  console.log("✓ Antigravity background service running");

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.active = "antigravity";
  state.switchedAt = new Date().toISOString();
  atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);

  console.log(`✓ Models available: ${config.models.length}`);
  console.log("\nCodex is now using Antigravity configuration (Google Antigravity models + native GPT router).");
  console.log("Restart Codex Desktop or CLI to apply changes.");
}

export async function toggle(options = {}) {
  if (isAntigravityActive()) {
    console.log("Currently active: Antigravity. Toggling to Native / Original configuration...");
    await switchToNative();
  } else {
    console.log("Currently active: Native / Original. Toggling to Antigravity configuration...");
    await switchToAntigravity(options);
  }
}

export async function status(options = {}) {
  const config = await freshConfig(options);
  const active = isAntigravityActive();
  const serviceRunning = isServiceRunning();
  console.log("=== Codex Bridge Antigravity Status ===");
  console.log(`  Active Config:   ${active ? "Antigravity (Bridge Router)" : "Native / Original (Direct OpenAI)"}`);
  console.log(`  Codex Config:    ${codexConfigPath()}`);
  console.log(`  Daemon Service:  ${serviceRunning ? "Running" : "Stopped"}`);
  try {
    const response = await fetch(`http://${config.host}:${config.port}/healthz`);
    if (response.ok) {
      const data = await response.json();
      console.log(`  Responses Proxy: Online (http://${config.host}:${config.port}/v1) [${data.model_count} models]`);
    } else {
      console.log(`  Responses Proxy: HTTP ${response.status}`);
    }
  } catch {
    console.log(`  Responses Proxy: Offline`);
  }
  const backup = backupCodexConfigPath();
  console.log(`  Backup Config:   ${existsSync(backup) ? backup : "Not created yet"}`);
  console.log("=======================================");
}

function disconnect() {
  const statePath = integrationStatePath();
  if (!existsSync(statePath)) throw new Error("Antigravity Codex integration is not installed");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  uninstallService();
  const current = existsSync(state.configPath) ? readFileSync(state.configPath, "utf8") : "";
  const currentRoute = getTopLevelAssignment(current, "openai_base_url");
  if (currentRoute && currentRoute !== state.route) throw new Error("Codex route changed after setup; refusing to overwrite it");
  if (state.hadConfig) {
    if (!state.backupPath || !existsSync(state.backupPath)) throw new Error(`Backup not found: ${state.backupPath || "(none)"}`);
    copyFileSync(state.backupPath, state.configPath);
    console.log(`Restored Codex config from ${state.backupPath}`);
  } else if (existsSync(state.configPath)) {
    unlinkSync(state.configPath);
    console.log("Removed the Codex config created by Antigravity setup");
  }
  const antigravityConfig = antigravityCodexConfigPath();
  if (existsSync(antigravityConfig)) unlinkSync(antigravityConfig);
  unlinkSync(statePath);
  console.log("✓ Integration disconnected and configuration restored.");
}

async function doctor(options) {
  const config = await freshConfig(options);
  let version;
  let models;
  try {
    version = await agyVersion(config.agyPath);
    models = await discoverAgyModels(config.agyPath);
  } catch (error) {
    console.log(`✗ AGY CLI: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ AGY CLI: ${version}`);
  console.log(`✓ AGY login/models response: ${models.length} models`);
  console.log(`✓ Working directory: ${config.cwd}`);
  console.log(`✓ Native GPT route: ${config.nativeBaseUrl}`);
  console.log("✓ Model router: native models passthrough; antigravity/* via WebSocket → AGY");
  try {
    const response = await fetch(`http://${config.host}:${config.port}/healthz`);
    console.log(response.ok ? `✓ Responses proxy: http://${config.host}:${config.port}` : `✗ Responses proxy: HTTP ${response.status}`);
  } catch {
    console.log(`! Responses proxy is not running: start with codex-bridge-antigravity serve`);
  }
}

async function refreshCatalog(options) {
  let config = await freshConfig(options);
  config = await refreshModels(config);
  const managedCatalog = buildCodexCatalog(config.models);
  const managedCatalogPath = catalogPath();
  atomicWrite(managedCatalogPath, `${JSON.stringify(managedCatalog, null, 2)}\n`);
  console.log(`Updated model catalog: ${managedCatalogPath}`);
  console.log(`Models in catalog: ${config.models.length}`);
}

async function serve(options) {
  let config = await freshConfig(options);
  config = await refreshModels(config);
  try {
    const managedCatalog = buildCodexCatalog(config.models);
    atomicWrite(catalogPath(), `${JSON.stringify(managedCatalog, null, 2)}\n`);
  } catch (err) {
    console.error(`Warning: failed to update catalog cache: ${err.message}`);
  }
  const server = createBridgeServer(config, config.models);
  await listenBridge(server, config);
  console.log(`codex-bridge-antigravity listening on http://${config.host}:${config.port}/v1`);
  console.log(`AGY: ${config.agyPath} | cwd: ${config.cwd} | mode: ${config.mode}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0] || "doctor";
  if (command === "version") {
    console.log("codex-bridge-antigravity 0.1.0");
    return;
  }
  if (command === "models") {
    const config = await freshConfig(options);
    const models = await discoverAgyModels(config.agyPath);
    for (const model of models) console.log(`${model.id}\t${model.displayName}`);
    return;
  }
  if (command === "doctor") return doctor(options);
  if (command === "serve") return serve(options);
  if (command === "setup") return setup(options);
  if (command === "refresh-catalog") return refreshCatalog(options);
  if (command === "disconnect") return disconnect();
  if (command === "toggle") return toggle(options);
  if (command === "switch") {
    const target = (positional[1] || "").toLowerCase();
    if (["native", "old", "original", "codex", "default"].includes(target)) {
      return switchToNative();
    }
    if (["antigravity", "agy", "bridge"].includes(target)) {
      return switchToAntigravity(options);
    }
    return toggle(options);
  }
  if (command === "enable") return switchToAntigravity(options);
  if (command === "disable") return switchToNative();
  if (command === "status") return status(options);
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(`codex-bridge-antigravity: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
