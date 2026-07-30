(function () {
  const target = new URL(window.location.href).searchParams.get("target") || "unknown";
  const clientInstanceId = `no-bridge-${target}-${Date.now()}`;
  const observedHostMessages = [];

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    observedHostMessages.push({
      type: message.type,
      bridgeSessionId: message.bridgeSessionId,
      operationId: message.operationId,
      code: message.error?.code
    });
    if (message.type !== "uxp-webview-bridge:no-bridge-control") return;
    const operationId = message.operationId;
    window.uxpHost.postMessage({
      type: "bridge.call",
      bridgeSessionId: message.bridgeSessionId,
      operationId,
      payload: { module: "os", method: "platform", args: [] }
    });
    setTimeout(() => {
      const response = observedHostMessages.find((entry) =>
        entry.operationId === operationId && ["bridge.success", "bridge.error"].includes(entry.type)
      );
      window.uxpHost.postMessage({
        type: "uxp-webview-bridge:no-bridge-result",
        id: message.id,
        target,
        operationId,
        response,
        observedHostMessages
      });
    }, 150);
  });

  // This hello intentionally occurs before the enclosing WebView load barrier completes.
  window.uxpHost.postMessage({
    type: "bridge.hello",
    protocolVersion: "0.3.0",
    clientVersion: "0.1.0",
    clientInstanceId
  });
  window.uxpHost.postMessage({
    type: "uxp-webview-bridge:webview-ready",
    phase: "no-bridge-ready",
    target,
    href: window.location.href,
    clientInstanceId,
    caseNames: [],
    caseTimeouts: {}
  });
})();
