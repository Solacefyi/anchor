#!/usr/bin/env bash
# Solace Anchor verifier (universal wrapper).
# Tries Python first, then Node, then fails with installation instructions.
#
# Usage:
#   ./verify.sh [hash]
#   ANCHOR_BASE_URL=https://solace.fyi/anchor ./verify.sh [hash]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  exec python3 "${SCRIPT_DIR}/verify.py" "$@"
elif command -v python >/dev/null 2>&1; then
  exec python "${SCRIPT_DIR}/verify.py" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "${SCRIPT_DIR}/verify.js" "$@"
else
  echo "Error: Solace Anchor verifier requires Python 3 or Node.js." >&2
  echo "Install one of them, or use the browser verifier at https://solace.fyi/anchor" >&2
  exit 1
fi
