export async function startWebviewHarness({ postReady, connect, normalizeError = defaultNormalizeError }) {
  postReady({ phase: "harness-ready" });

  try {
    const bridge = await connect();
    postReady({ phase: "bridge-ready", ...bridge });
  } catch (error) {
    postReady({ phase: "bridge-failed", bridgeError: normalizeError(error) });
  }
}

function defaultNormalizeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}
