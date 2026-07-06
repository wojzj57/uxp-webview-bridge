# Derive UXP WebView module types from src/types

The UXP bridge should treat `src/types/uxp` as the native UXP API type source, copy or generate a WebView-local type mirror before implementation, and derive WebView remote namespace types from that mirror instead of hand-writing API shapes in shared contracts. This keeps the implementation aligned with the local Adobe UXP type source while preserving the runtime boundary that WebView exports are remote proxies, not native UXP objects.
