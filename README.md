# PEP Order Desk

Milestone 1 of the PEP Brands FDE assignment. The public landing page links to a database readiness check.

## Run the checks

With Node 24, run `npm test` and `npm run build`. No package installation is required. The local health test executes SQL against SQLite, closes the connection and checks that the endpoint returns 503.

## Runtime

A JavaScript Worker handles GET / and GET /health. The runtime injects DB (a D1 SQL database) and BUCKET (R2 object storage). These are resource bindings rather than textual credentials. The hosting manifest declares their logical names. No secrets are needed in source. PDF storage operations begin in milestone 2.

GET /health executes SELECT 1 AS reachable, returns HTTP 200 only for a successful answer, and sends HTTP 503 with a friendly message on failure. Failed probes emit timestamped JSON logs. The response disables caching.
