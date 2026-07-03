import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliOptions = parseCliOptions(process.argv.slice(2));
const cdpUrl = process.env.UXP_CDP_URL ?? cliOptions.cdpUrl;
const caseName = process.env.UXP_TEST_CASE ?? cliOptions.caseName;
const suiteName = process.env.UXP_TEST_SUITE ?? cliOptions.suiteName;
const timeoutMs = Number(process.env.UXP_TEST_TIMEOUT_MS ?? 15_000);
const shouldReload = cliOptions.reload === true;

if (!cdpUrl) {
  console.error("Missing CDP URL. Pass --cdp-url, argv[2], or set UXP_CDP_URL.");
  process.exit(2);
}

const client = await connectCdp(cdpUrl, timeoutMs);

try {
  await client.enableRuntime();
  await client.waitForContext(timeoutMs);

  if (shouldReload) {
    await reloadPanel(client);
  }

  await pollForWebViewReady(client, timeoutMs);

  if (suiteName) {
    const result = await runSuite(client, suiteName);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "passed") {
      process.exit(1);
    }
  } else if (caseName) {
    const result = await runSingleCase(client, caseName ?? "bridge.ping", timeoutMs);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") {
      process.exit(1);
    }
  } else {
    const result = await runAllCases(client);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "passed") {
      process.exit(1);
    }
  }
} finally {
  client.close();
}

async function runAllCases(client) {
  const caseNames = await client.evaluate("(window.__UXP_BRIDGE_TEST_CASES__ || []).slice().sort()");
  if (!Array.isArray(caseNames) || caseNames.length === 0) {
    throw new Error("No generated CDP cases were found in the WebView harness.");
  }

  const startedAt = Date.now();
  const results = [];

  for (const name of caseNames) {
    results.push(await runSingleCase(client, name, timeoutMs));
  }

  return {
    suiteName: "all",
    status: results.some((result) => result.status === "failed") ? "failed" : "passed",
    durationMs: Date.now() - startedAt,
    cases: results
  };
}

async function runSuite(client, name) {
  const suite = await readSuite(name);
  const startedAt = Date.now();
  const results = [];

  for (const testCase of suite.cases) {
    const result = await runSingleCase(
      client,
      testCase.caseName,
      Number(testCase.timeoutMs ?? suite.timeoutMs ?? timeoutMs)
    );
    results.push(result);
  }

  return {
    suiteName: suite.suiteName ?? name,
    status: results.some((result) => result.status === "failed") ? "failed" : "passed",
    durationMs: Date.now() - startedAt,
    cases: results
  };
}

async function readSuite(name) {
  const suitePath = path.join(repoRoot, "test", "cdp", "suites", `${name}.json`);
  const suite = JSON.parse(await readFile(suitePath, "utf8"));

  if (!Array.isArray(suite.cases)) {
    throw new Error(`CDP suite ${name} must define a cases array.`);
  }

  for (const testCase of suite.cases) {
    if (!testCase || typeof testCase.caseName !== "string") {
      throw new Error(`CDP suite ${name} contains a case without caseName.`);
    }
  }

  return suite;
}

async function runSingleCase(client, name, timeout) {
  await client.evaluate(
    `window.__runUxpBridgeTest(${JSON.stringify(name)}, ${JSON.stringify({ from: "cdp-runner" })})`
  );

  return pollForResult(client, name, timeout);
}

async function reloadPanel(client) {
  try {
    await client.evaluate("setTimeout(() => location.reload(), 0); true");
  } catch {
    // Some UXP reloads invalidate the current evaluation; readiness polling owns the real result.
  }

  client.clearContext();
  await delay(750);
  await client.waitForContext(timeoutMs);
}

async function pollForResult(client, expectedCaseName, timeout) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const result = await client.evaluate("window.__UXP_BRIDGE_TEST_RESULT__");
    if (result && result.caseName === expectedCaseName && result.status !== "running") {
      return result;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for UXP test case ${expectedCaseName}.`);
}

async function pollForWebViewReady(client, timeout) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const isReady = await client.evaluate("window.__UXP_BRIDGE_WEBVIEW_READY__ === true");
    if (isReady) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for UXP WebView test harness readiness.");
}

function connectCdp(url, commandTimeoutMs) {
  const pending = new Map();
  let nextId = 1;
  let contextId;
  const ws = new WebSocket(url);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.executionContextCreated") {
      contextId = message.params?.context?.id;
    }

    if (message.id) {
      const request = pending.get(message.id);
      if (!request) {
        return;
      }
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }

      request.resolve(message.result);
    }
  });

  const openPromise = new Promise((resolveOpen, rejectOpen) => {
    const timeoutId = setTimeout(
      () => rejectOpen(new Error(`Timed out opening CDP WebSocket after ${commandTimeoutMs}ms.`)),
      commandTimeoutMs
    );
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener(
      "open",
      () => clearTimeout(timeoutId),
      { once: true }
    );
    ws.addEventListener(
      "error",
      (event) => {
        clearTimeout(timeoutId);
        rejectOpen(new Error(event.message || "CDP WebSocket connection failed."));
      },
      { once: true }
    );
  });

  return {
    close() {
      ws.close();
    },

    async enableRuntime() {
      await openPromise;
      await send("Runtime.enable");
    },

    waitForContext(timeout) {
      const startedAt = Date.now();
      return new Promise((resolveContext, rejectContext) => {
        const interval = setInterval(() => {
          if (contextId) {
            clearInterval(interval);
            resolveContext(contextId);
            return;
          }

          if (Date.now() - startedAt >= timeout) {
            clearInterval(interval);
            rejectContext(new Error("Timed out waiting for Runtime execution context."));
          }
        }, 50);
      });
    },

    clearContext() {
      contextId = undefined;
    },

    async evaluate(expression) {
      if (!contextId) {
        await this.waitForContext(commandTimeoutMs);
      }

      const result = await send(
        "Runtime.evaluate",
        {
          contextId,
          expression,
          returnByValue: true,
          awaitPromise: true
        },
        `Runtime.evaluate ${expression.slice(0, 120)}`
      );

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed.");
      }

      return result.result?.value;
    }
  };

  function send(method, params, label = method) {
    const id = nextId++;
    const message = { id, method, params };
    const response = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${label} after ${commandTimeoutMs}ms.`));
      }, commandTimeoutMs);

      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    });
    ws.send(JSON.stringify(message));
    return response;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCliOptions(args) {
  let cdpUrl;
  let caseName;
  let suiteName;
  let reload = false;
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--cdp-url") {
      cdpUrl = args[++index];
      continue;
    }

    if (arg === "--case") {
      caseName = args[++index];
      continue;
    }

    if (arg === "--suite") {
      suiteName = args[++index];
      continue;
    }

    if (arg === "--no-reload") {
      reload = false;
      continue;
    }

    if (arg === "--reload") {
      reload = true;
      continue;
    }

    positional.push(arg);
  }

  return {
    cdpUrl: cdpUrl ?? positional[0],
    caseName: caseName ?? positional[1],
    suiteName,
    reload
  };
}
