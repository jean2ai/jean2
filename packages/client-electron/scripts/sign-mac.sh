#!/usr/bin/env bash
set -euo pipefail

# Sign, notarize, and package Jean2 Electron app for macOS
# Usage: ./scripts/sign-mac.sh
#
# Required env vars for notarization:
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

APP_PATH="$PROJECT_DIR/release/mac-arm64/Jean2.app"
ENTITLEMENTS="$PROJECT_DIR/build/entitlements.mac.plist"
CERT_NAME="${CSC_NAME:-Developer ID Application: Daniel Bílek (DWBCQA26TH)}"
APP_VERSION=$(node -e "console.log(require('$PROJECT_DIR/package.json').version)")
RELEASE_DIR="$PROJECT_DIR/release"

echo "📦 Jean2 v${APP_VERSION}"
echo "   App: $APP_PATH"
echo "   Certificate: $CERT_NAME"

if [ ! -d "$APP_PATH" ]; then
  echo "❌ App not found at $APP_PATH"
  echo "   Run 'bun run electron:build:mac' first"
  exit 1
fi

# Step 1: Sign all nested binaries (inside-out order)
echo ""
echo "🔐 Signing nested binaries..."

FRAMEWORKS_DIR="$APP_PATH/Contents/Frameworks"

# 1a. Sign all .dylib files
find "$FRAMEWORKS_DIR" -name "*.dylib" -type f | while read -r dylib; do
  echo "   dylib: $(basename "$dylib")"
  codesign --force --sign "$CERT_NAME" --timestamp "$dylib" 2>&1
done

# 1b. Sign all helper apps
find "$FRAMEWORKS_DIR" -name "*.app" -type d -maxdepth 1 | while read -r helper; do
  echo "   helper: $(basename "$helper")"
  codesign --force --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$CERT_NAME" --timestamp \
    "$helper" 2>&1
done

# 1c. Sign all .framework bundles
find "$FRAMEWORKS_DIR" -name "*.framework" -type d -maxdepth 1 | sort -r | while read -r fw; do
  FW_VERSIONS="$fw/Versions/A"
  if [ -d "$FW_VERSIONS" ]; then
    find "$FW_VERSIONS" -type f -perm +111 ! -name "*.dylib" 2>/dev/null | while read -r exe; do
      echo "   exe: $(basename "$exe")"
      codesign --force --options runtime \
        --entitlements "$ENTITLEMENTS" \
        --sign "$CERT_NAME" --timestamp \
        "$exe" 2>&1
    done
    FW_RESOURCES="$FW_VERSIONS/Resources"
    if [ -d "$FW_RESOURCES" ]; then
      find "$FW_RESOURCES" -type f -perm +111 ! -name "*.dylib" 2>/dev/null | while read -r exe; do
        echo "   exe: $(basename "$exe")"
        codesign --force --options runtime \
          --entitlements "$ENTITLEMENTS" \
          --sign "$CERT_NAME" --timestamp \
          "$exe" 2>&1
      done
    fi
  fi
  echo "   framework: $(basename "$fw")"
  codesign --force --sign "$CERT_NAME" --timestamp "$fw" 2>&1
done

# 1d. Sign the main app
echo "   app: Jean2.app"
codesign --force --options runtime \
  --entitlements "$ENTITLEMENTS" \
  --sign "$CERT_NAME" --timestamp \
  "$APP_PATH" 2>&1

echo "✅ Signing complete"

# Step 2: Verify
echo "🔍 Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1
echo "✅ Signature verified"

# Step 3: Signature details
echo "📋 Signature details:"
codesign -dvv "$APP_PATH" 2>&1 | grep -E "Identifier|Authority|Runtime" || true

# Step 4: Check if notarization env vars are set
if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo ""
  echo "⚠️  Skipping notarization. Set these env vars to notarize:"
  echo "   export APPLE_ID=\"daniel.bilek@icloud.com\""
  echo "   export APPLE_APP_SPECIFIC_PASSWORD=\"xxxx-xxxx-xxxx-xxxx\""
  echo "   export APPLE_TEAM_ID=\"DWBCQA26TH\""
  echo ""
  echo "✅ Signed app ready at: $APP_PATH"
  exit 0
fi

# Step 5: Notarize
echo ""
echo "📤 Notarizing (this takes 2-5 minutes)..."
node --input-type=module -e "
import { notarize } from '@electron/notarize';
await notarize({
  appPath: '$APP_PATH',
  appleId: process.env.APPLE_ID,
  appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
  teamId: process.env.APPLE_TEAM_ID,
});
console.log('✅ Notarization complete');
"

# Step 6: Staple
echo "📎 Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

# Step 7: Rebuild DMG from signed+notarized app
OLD_DMG="$RELEASE_DIR/Jean2-${APP_VERSION}-arm64.dmg"
if [ -f "$OLD_DMG" ]; then
  echo ""
  echo "💿 Rebuilding DMG with signed+notarized app..."
  rm -f "$OLD_DMG"

  DMG_TEMP="$RELEASE_DIR/Jean2-temp.dmg"
  hdiutil create -volname "Jean2" \
    -srcfolder "$APP_PATH" \
    -ov -format UDZO \
    "$OLD_DMG"

  echo "✅ DMG rebuilt: $OLD_DMG"
fi

echo ""
echo "🎉 Signed, notarized & packaged!"
echo "   App: $APP_PATH"
echo "   DMG: $RELEASE_DIR/Jean2-${APP_VERSION}-arm64.dmg"
