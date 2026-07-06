# CDP Assertions Live in the WebView Harness

CDP case assertions live primarily in the WebView harness, where the public WebView API is called and observed. The UXP fixture configures the host and exposes only necessary diagnostics, while the CDP runner selects cases or suites, waits for results, handles timeouts, and prints structured output without knowing module-specific semantics.
