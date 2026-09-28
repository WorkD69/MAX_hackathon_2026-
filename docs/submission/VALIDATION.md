# Baseline delivery validation

SOURCE_SHA `5045dd220b85bbd89038821aac110ec46c44a9d3`.
На Linux Docker build stage: Node 24.21.0/npm 11.19.0; production API/web compile PASS.
Actual factory onRoute export: 61 events, 45 API/health/webhook/download operations.
Bidirectional registry parity PASS. YAML, DATA-API, JSON Schema и request fixtures PASS.
ENV parity: 25 canonical + 4 delivery keys; typed production config PASS.
Dockerfile/Compose/pins/ignore/lockfile structure PASS. Secret pattern scan PASS.

Это source/package validation, не свидетельство native MAX launch.
Live deployment и проверки persistent data фиксируются в PUBLIC_MAX_SMOKE.md.
MVP тесты (1025 и прочие gates) предоставлены командой для SOURCE_SHA; повторный полный
product regression не выполняется, поскольку продуктовые исходники не меняются.
