export default async function bridgePing({ payload }) {
  return {
    ok: true,
    echo: payload ?? null,
    href: window.location.href,
    hasUxpHost: typeof window.uxpHost !== "undefined"
  };
}
