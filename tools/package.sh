#!/bin/sh
# Builds hiring-signals-extension-<version>.zip with manifest.json at the zip root.
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./manifest.json').version")
OUT="hiring-signals-extension-$V.zip"
rm -f "$OUT"
zip -X -q "$OUT" manifest.json popup.html popup.css popup.js ats.js icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
unzip -l "$OUT"
