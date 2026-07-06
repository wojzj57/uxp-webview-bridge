/**
 * The WebView forwarded-fetch surface. It mirrors the standard `fetch`
 * signature so it can be used as a drop-in replacement, but the request is
 * actually performed on the UXP host to bypass browser CORS.
 */
export type FetchNamespace = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
