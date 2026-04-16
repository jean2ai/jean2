#!/usr/bin/env bash
set -euo pipefail

# Sign Jean2 Electron app for Windows
# Usage: ./scripts/sign-win.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🪟 Windows code signing not yet configured"
echo "   To set up: https://www.electron.build/code-signing-win"
exit 0