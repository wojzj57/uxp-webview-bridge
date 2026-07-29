# Errors, cancellation, and callbacks

Host failures reject in the WebView with an error whose `name` is `BridgeRemoteError`. Exact fields are `message`, `operationId`, `remoteName`, `remoteMessage`, `remoteStack`, optional `code`, `parentOperationId`, and `callbackId`. The class is not a public WebView export, so narrow by shape/name instead of importing it.

```ts
try {
  await fs.readFile("plugin-data:/missing.json", { encoding: "utf-8" });
} catch (error) {
  if (error instanceof Error && error.name === "BridgeRemoteError") {
    const remote = error as Error & { operationId?: string; code?: string };
    console.error(remote.code, remote.operationId, remote.message);
  }
}
```

Request timeout errors are local `Error`s and cause a cancel envelope to be sent. Forwarded `fetch` maps `AbortSignal` to the same cancellation mechanism.

Forwarded `fetch` is the exception to direct remote-error surfacing: it wraps non-abort host/network failures in a fetch-compatible `TypeError` and retains the original error as `cause`.

Callbacks are retained while registered and released on removal or runtime destruction. Notification listeners are asynchronous and serialized per subscription. The host caps queued listener work; overflow closes the subscription and reports an unhandled bridge error. Use `onUnhandledError` in `configWebviewBridge` when listener reliability matters.

Inside `photoshop.core.executeAsModal` and `document.suspendHistory`, callback calls share a host modal session. Do not start unrelated concurrent bridge work while that session is active.
