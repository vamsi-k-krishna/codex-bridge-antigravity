import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appHome } from "./config.mjs";

export const SERVICE_LABEL = "io.github.codex-bridge-antigravity.daemon";

function launchAgentsDir() {
  return join(homedir(), "Library", "LaunchAgents");
}

export function servicePlistPath() {
  return join(launchAgentsDir(), `${SERVICE_LABEL}.plist`);
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistString(value) {
  return `<string>${xml(value)}</string>`;
}

function uid() {
  return typeof process.getuid === "function" ? String(process.getuid()) : undefined;
}

function serviceTarget() {
  const user = uid();
  return user ? `gui/${user}/${SERVICE_LABEL}` : undefined;
}

function launchctl(args) {
  return spawnSync("launchctl", args, { encoding: "utf8" });
}

export function buildServicePlist(config) {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const logDir = join(appHome(), "logs");
  const programArguments = [
    process.execPath,
    cliPath,
    "serve",
    "--cwd", config.cwd,
    "--port", String(config.port),
    "--mode", config.mode,
    "--agy-path", config.agyPath,
  ];
  const argumentXml = programArguments.map(plistString).join("\n        ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  ${plistString(SERVICE_LABEL)}
  <key>ProgramArguments</key>
  <array>
        ${argumentXml}
  </array>
  <key>WorkingDirectory</key>
  ${plistString(config.cwd)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    ${plistString(homedir())}
    <key>PATH</key>
    ${plistString(`${dirname(process.execPath)}:/usr/local/bin:/opt/homebrew/bin:${homedir()}/.local/bin:/usr/bin:/bin`)}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  ${plistString(join(logDir, "service.log"))}
  <key>StandardErrorPath</key>
  ${plistString(join(logDir, "service.error.log"))}
</dict>
</plist>
`;
}

export function serviceSystemdPath() {
  return join(homedir(), ".config", "systemd", "user", `${SERVICE_LABEL}.service`);
}

export function buildSystemdUnit(config) {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const logDir = join(appHome(), "logs");
  const pathEnv = `${dirname(process.execPath)}:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin`;
  return `[Unit]
Description=Codex Bridge Antigravity Daemon
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${cliPath} serve --cwd "${config.cwd}" --port ${config.port} --mode ${config.mode} --agy-path "${config.agyPath}"
WorkingDirectory=${config.cwd}
Environment=HOME=${homedir()}
Environment=PATH=${pathEnv}
Restart=always
RestartSec=5
StandardOutput=append:${join(logDir, "service.log")}
StandardError=append:${join(logDir, "service.error.log")}

[Install]
WantedBy=default.target
`;
}

export function installService(config) {
  if (process.platform === "darwin") {
    const plistPath = servicePlistPath();
    const logDir = join(appHome(), "logs");
    mkdirSync(dirname(plistPath), { recursive: true, mode: 0o700 });
    mkdirSync(logDir, { recursive: true, mode: 0o700 });
    writeFileSync(plistPath, buildServicePlist(config), { mode: 0o600 });
    chmodSync(plistPath, 0o600);
    const user = uid();
    if (!user) throw new Error("Cannot determine the macOS user id for launchd");
    launchctl(["bootout", `gui/${user}/${SERVICE_LABEL}`]);
    const loaded = launchctl(["bootstrap", `gui/${user}`, plistPath]);
    if (loaded.status !== 0) {
      throw new Error(`launchctl bootstrap failed: ${(loaded.stderr || loaded.stdout || "unknown error").trim()}`);
    }
    return { installed: true, plistPath, target: serviceTarget() };
  }
  if (process.platform === "linux") {
    const servicePath = serviceSystemdPath();
    const logDir = join(appHome(), "logs");
    mkdirSync(dirname(servicePath), { recursive: true, mode: 0o700 });
    mkdirSync(logDir, { recursive: true, mode: 0o700 });
    writeFileSync(servicePath, buildSystemdUnit(config), { mode: 0o644 });
    spawnSync("systemctl", ["--user", "daemon-reload"]);
    const enabled = spawnSync("systemctl", ["--user", "enable", "--now", `${SERVICE_LABEL}.service`], { encoding: "utf8" });
    if (enabled.status !== 0) {
      throw new Error(`systemctl enable failed: ${(enabled.stderr || enabled.stdout || "unknown error").trim()}`);
    }
    return { installed: true, plistPath: servicePath, servicePath, target: `${SERVICE_LABEL}.service` };
  }
  return { installed: false, reason: "Unsupported OS" };
}

export function uninstallService() {
  if (process.platform === "darwin") {
    const user = uid();
    if (user) launchctl(["bootout", `gui/${user}/${SERVICE_LABEL}`]);
    const plistPath = servicePlistPath();
    if (existsSync(plistPath)) unlinkSync(plistPath);
    return { removed: true, plistPath };
  }
  if (process.platform === "linux") {
    spawnSync("systemctl", ["--user", "stop", `${SERVICE_LABEL}.service`]);
    spawnSync("systemctl", ["--user", "disable", `${SERVICE_LABEL}.service`]);
    const servicePath = serviceSystemdPath();
    if (existsSync(servicePath)) unlinkSync(servicePath);
    spawnSync("systemctl", ["--user", "daemon-reload"]);
    return { removed: true, plistPath: servicePath };
  }
  return { removed: false, reason: "Unsupported OS" };
}

