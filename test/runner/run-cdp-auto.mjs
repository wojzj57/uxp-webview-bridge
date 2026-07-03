import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const devtoolsPortRange = parsePortRange(process.env.UXP_DEVTOOLS_PORT_RANGE ?? "14000-14100");
const cdpUrlTimeoutMs = Number(process.env.UXP_CDP_URL_TIMEOUT_MS ?? 30_000);

await runNodeScript("test/runner/prepare-uxp-fixture.mjs", []);
await stopStaleDevtoolsProcesses(devtoolsPortRange);

const cdpHelper = startCdpUrlHelper();
let exitCode = 1;

try {
  const cdpUrl = await withTimeout(
    cdpHelper.cdpUrlPromise,
    cdpUrlTimeoutMs,
    `Timed out waiting ${cdpUrlTimeoutMs}ms for uxp-cli to print a CDP URL.`
  );
  console.log(`Captured CDP URL. Running CDP test with ${cdpUrl}`);
  exitCode = await runNodeScript("test/runner/run-cdp-test.mjs", ["--cdp-url", cdpUrl, ...args]);
  console.log(`CDP test process exited with code ${exitCode}.`);
} finally {
  await stopProcessTree(cdpHelper.process.pid);
}

process.exit(exitCode);

function startCdpUrlHelper() {
  const child = spawn(
    "pnpm",
    ["exec", "uxp-cli", "create-cdp-url", "--plugin-path", "./test/uxp-plugin"],
    {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const output = [];
  let cdpUrlResolve;
  let cdpUrlReject;
  let cdpUrlSettled = false;
  const cdpUrlPromise = new Promise((resolve, reject) => {
    cdpUrlResolve = resolve;
    cdpUrlReject = reject;
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    captureOutput(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    captureOutput(chunk);
  });

  child.on("exit", (code) => {
    if (!cdpUrlSettled) {
      cdpUrlSettled = true;
      cdpUrlReject(new Error(`uxp-cli exited before printing a CDP URL with code ${code}.\n${output.join("")}`));
    }
  });

  return { process: child, cdpUrlPromise };

  function captureOutput(chunk) {
    output.push(chunk);
    const match = output.join("").match(/ws:\/\/[^\s]+/);
    if (!match || cdpUrlSettled) {
      return;
    }

    cdpUrlSettled = true;
    cdpUrlResolve(match[0]);
  }
}

function runNodeScript(scriptPath, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function stopStaleDevtoolsProcesses({ start, end }) {
  if (process.platform !== "win32") {
    return;
  }

  const script = `
$ports = ${start}..${end}
$processIds = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  if ($processId -eq ${process.pid}) { continue }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $path = [string]$process.ExecutablePath
  $commandLine = [string]$process.CommandLine
  $isDevtoolsProcess =
    $path -like "*Adobe UXP Developer Tools*" -or
    $commandLine -like "*uxp-cli*" -or
    $commandLine -like "*uxp-devtools*" -or
    $commandLine -like "*@bubblydoo*uxp*"

  if (-not $isDevtoolsProcess) { continue }

  if ($process) {
    Write-Output "Stopping stale UXP DevTools process using ports ${start}-${end}: PID=$processId Path=$($process.ExecutablePath)"
  } else {
    Write-Output "Stopping stale UXP DevTools process using ports ${start}-${end}: PID=$processId"
  }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

exit 0
`;

  const result = await runPowerShell(script);
  if (result.stdout.trim().length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.trim().length > 0) {
    process.stderr.write(result.stderr);
  }
}

function parsePortRange(value) {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (match) {
    return {
      start: Number(match[1]),
      end: Number(match[2])
    };
  }

  const port = Number(value);
  if (Number.isInteger(port) && port > 0) {
    return { start: port, end: port };
  }

  throw new Error(`Invalid UXP_DEVTOOLS_PORT_RANGE value: ${value}`);
}

function stopProcessTree(pid) {
  if (!pid) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore"
      });
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
    });
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The helper may already have exited.
  }
  return Promise.resolve();
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { cwd: repoRoot, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error && stderr.trim().length === 0) {
          stderr = `${error.message}\n`;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
