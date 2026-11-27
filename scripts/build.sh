#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/server dist/.openai
./node_modules/.bin/esbuild worker/index.js --bundle --format=esm --platform=browser --alias:crypto=./scripts/browser-crypto.js --outfile=dist/server/index.js
cp .openai/hosting.json dist/.openai/
