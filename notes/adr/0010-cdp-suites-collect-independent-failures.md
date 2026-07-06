# CDP Suites Collect Independent Failures

CDP suites run independent cases to completion by default so one failure does not hide other runtime issues. Fatal fixture initialization, WebView readiness, or CDP connection failures stop the suite, while explicit case dependencies can skip downstream cases; `--fail-fast` remains a local debugging option rather than the default CI behavior.
