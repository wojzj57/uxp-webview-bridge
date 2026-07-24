import { fetch as forwardedFetch } from "./fetch.js";
import type { FetchNamespace } from "./types.js";

type GlobalWithFetch = { fetch?: FetchNamespace };

let originalFetch: FetchNamespace | undefined;
let installed = false;

/**
 * Opt-in installer that replaces the global `fetch` with the forwarded fetch,
 * so code you do not control (bundled libraries, third-party SDKs) also routes
 * through the UXP host and bypasses CORS. The global is only ever overridden
 * when this is called explicitly.
 *
 * Returns an uninstaller that restores the previously captured global `fetch`.
 * Calling it more than once is safe: the true original is captured only on the
 * first install and preserved across re-installs.
 */
export function installFetch(): () => void {
  const target = globalThis as GlobalWithFetch;

  if (!installed) {
    originalFetch = target.fetch;
    installed = true;
  }

  target.fetch = forwardedFetch;

  return function uninstallFetch(): void {
    if (!installed) {
      return;
    }
    if (originalFetch === undefined) {
      delete target.fetch;
    } else {
      target.fetch = originalFetch;
    }
    originalFetch = undefined;
    installed = false;
  };
}
