#!/usr/bin/env bash
# Copy the public site (and nothing else) into the directory given as $1.
# Used by .github/workflows/deploy.yml (legacy GitHub Pages) and by the
# Kokoroou/makerlens repo, which serves this tool at /assets/ on Cloudflare.
# A new top-level file the site serves must be added here.
set -euo pipefail
out=${1:?usage: scripts/assemble-site.sh <out-dir>}
cd "$(dirname "$0")/.."
mkdir -p "$out"
cp -R index.html privacy.html faq.html css js og-image.png llms.txt \
      screenshots LICENSE LEGAL.md README.md "$out"/
