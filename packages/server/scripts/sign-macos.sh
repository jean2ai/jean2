#!/bin/bash
# sign-macos.sh - Sign and notarize the Jean2 server binary for macOS
#
# This script performs local code signing and notarization testing.
# It allows developers to verify the signing process before pushing to CI.
#
# Required Environment Variables:
#   APPLE_ID               - Your Apple Developer email (e.g., dev@example.com)
#   APPLE_APP_SPECIFIC_PASSWORD - App-specific password from appleid.apple.com
#   APPLE_TEAM_ID          - Your Team ID from Apple Developer portal
#
# Optional Environment Variables:
#   CSC_LINK               - Base64-encoded .p12 certificate file
#                           If not set, searches Keychain for "Developer ID Application"
#   CSC_KEY_PASSWORD        - Password for the .p12 certificate (if password-protected)
#
# Usage:
#   ./sign-macos.sh [binary_path] [entitlements_path]
#
# Examples:
#   ./sign-macos.sh                                    # Uses defaults
#   ./sign-macos.sh ./dist/jean2-darwin                # Custom binary
#   CSC_LINK=$(base64 -i cert.p12) ./sign-macos.sh    # With certificate

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default paths
BINARY_PATH="${1:-packages/server/dist/bin/jean2-macos-arm64}"
ENTITLEMENTS_PATH="${2:-packages/server/build/entitlements.mac.plist}"

# Track temp files for cleanup
TEMP_FILES=()

###############################################################################
# Helper Functions
###############################################################################

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

cleanup() {
  for file in "${TEMP_FILES[@]:-}"; do
    if [[ -n "$file" && -e "$file" ]]; then
      rm -rf "$file"
      info "Cleaned up: $file"
    fi
  done
  # Reset temp files array
  TEMP_FILES=()
}

trap cleanup EXIT

###############################################################################
# Validation
###############################################################################

print_header() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║         Jean2 Server - macOS Code Signing & Notarization      ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_requirements() {
  echo -e "${YELLOW}Required Environment Variables:${NC}"
  echo "  APPLE_ID                   - Apple Developer email"
  echo "  APPLE_APP_SPECIFIC_PASSWORD - App-specific password from appleid.apple.com"
  echo "  APPLE_TEAM_ID              - Team ID (found in Apple Developer account)"
  echo ""
  echo -e "${BLUE}Optional Environment Variables:${NC}"
  echo "  CSC_LINK                   - Base64-encoded .p12 certificate"
  echo "                               If not set, searches Keychain for"
  echo "                               'Developer ID Application' certificate"
  echo "  CSC_KEY_PASSWORD            - Password for the .p12 certificate (if set)"
  echo ""
}

check_env_vars() {
  local missing=()

  if [[ -z "${APPLE_ID:-}" ]]; then
    missing+=("APPLE_ID")
  fi

  if [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
    missing+=("APPLE_APP_SPECIFIC_PASSWORD")
  fi

  if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
    missing+=("APPLE_TEAM_ID")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    error "Missing required environment variables:"
    for var in "${missing[@]}"; do
      echo "  - $var"
    done
    echo ""
    echo "Example setup:"
    echo "  export APPLE_ID=\"dev@example.com\""
    echo "  export APPLE_APP_SPECIFIC_PASSWORD=\"xxxx-xxxx-xxxx-xxxx\""
    echo "  export APPLE_TEAM_ID=\"A1B2C3D4E5\""
    echo ""
    echo "To create an App-Specific Password:"
    echo "  1. Visit https://appleid.apple.com/account/manage"
    echo "  2. Go to 'App-Specific Passwords'"
    echo "  3. Click '+' to generate a new password"
    echo ""
    exit 1
  fi
}

check_binary() {
  if [[ ! -f "$BINARY_PATH" ]]; then
    error "Binary not found: $BINARY_PATH"
    echo ""
    echo "Please build the binary first:"
    echo "  bun run build:bin:macos"
    echo ""
    exit 1
  fi

  if [[ ! -f "$ENTITLEMENTS_PATH" ]]; then
    error "Entitlements not found: $ENTITLEMENTS_PATH"
    echo ""
    echo "The entitlements file should exist at:"
    echo "  packages/server/build/entitlements.mac.plist"
    echo ""
    exit 1
  fi

  info "Binary: $BINARY_PATH"
  info "Entitlements: $ENTITLEMENTS_PATH"
}

###############################################################################
# Certificate Handling
###############################################################################

setup_certificate() {
  local p12_path=""
  local keychain_path=""
  local keychain_password=""
  local signing_identity=""

  if [[ -n "${CSC_LINK:-}" ]]; then
    info "Using CSC_LINK certificate..."

    # Create temp files
    p12_path=$(mktemp /tmp/jean2-signing.XXXXXX.p12)
    TEMP_FILES+=("$p12_path")

    keychain_path=$(mktemp /tmp/jean2-signing.XXXXXX.keychain)
    TEMP_FILES+=("$keychain_path")

    keychain_password=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

    # Decode base64 certificate
    info "Decoding certificate..."
    echo "$CSC_LINK" | base64 -d > "$p12_path"

    # Create new keychain
    info "Creating temporary keychain..."
    security create-keychain -p "$keychain_password" "$keychain_path"

    # Set keychain as default and unlock it
    security list-keychains -s "$keychain_path"
    security unlock-keychain -p "$keychain_password" "$keychain_path"

    # Import certificate
    info "Importing certificate to keychain..."
    local cert_password="${CSC_KEY_PASSWORD:-}"
    security import "$p12_path" -P "$cert_password" -k "$keychain_path" -T /usr/bin/codesign -T /usr/bin/security

    # Set keychain timeout (important for signing)
    security set-keychain-settings -lut 3600 "$keychain_path"

    # Find the signing identity
    signing_identity=$(security find-identity -v -p codesigning "$keychain_path" 2>/dev/null | grep "Developer ID Application" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

    if [[ -z "$signing_identity" ]]; then
      error "Could not find Developer ID Application certificate in the provided .p12 file"
      exit 1
    fi
  else
    info "Searching for Developer ID Application certificate in Keychain..."

    # Search for Developer ID Application certificate
    signing_identity=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

    if [[ -z "$signing_identity" ]]; then
      error "No 'Developer ID Application' certificate found in Keychain"
      echo ""
      echo "Please either:"
      echo "  1. Set CSC_LINK with your base64-encoded .p12 certificate"
      echo "  2. Or install a Developer ID Application certificate in your Keychain"
      echo ""
      echo "To install a certificate:"
      echo "  1. Download your certificate from Apple Developer portal"
      echo "  2. Double-click the .cer file to add to Keychain"
      echo "  3. Or use: security import your-cert.cer -k ~/Library/Keychains/login.keychain"
      echo ""
      exit 1
    fi

    info "Found certificate: $signing_identity"
  fi

  echo "$signing_identity"
}

###############################################################################
# Code Signing
###############################################################################

sign_binary() {
  local signing_identity="$1"

  info "Removing existing signature..."
  codesign --remove-signature "$BINARY_PATH" 2>/dev/null || true

  info "Code signing binary..."
  info "Identity: $signing_identity"

  if codesign --force --options runtime --entitlements "$ENTITLEMENTS_PATH" --sign "$signing_identity" "$BINARY_PATH" 2>&1; then
    success "Binary signed successfully"
  else
    error "Code signing failed"
    exit 1
  fi
}

verify_signature() {
  info "Verifying signature..."

  if codesign --verify --deep --strict --verbose=2 "$BINARY_PATH" 2>&1; then
    success "Signature verification passed"
  else
    error "Signature verification failed"
    exit 1
  fi
}

display_signature() {
  info "Displaying signature details..."
  codesign --display --entitlements - "$BINARY_PATH" 2>&1 | while IFS= read -r line; do
    echo "  $line"
  done
}

###############################################################################
# Notarization
###############################################################################

create_zip() {
  local zip_path="$1"
  local parent_dir
  local binary_name

  parent_dir=$(dirname "$BINARY_PATH")
  binary_name=$(basename "$BINARY_PATH")

  info "Creating zip archive for notarization..."

  # Go to the binary's directory and create zip from there
  # This ensures the zip structure is correct for stapling
  (cd "$parent_dir" && zip -y -r "$zip_path" "$binary_name")

  if [[ -f "$zip_path" ]]; then
    success "Zip created: $zip_path"
  else
    error "Failed to create zip archive"
    exit 1
  fi
}

submit_notarization() {
  local zip_path="$1"

  info "Submitting for notarization..."
  info "Apple ID: $APPLE_ID"
  info "Team ID: $APPLE_TEAM_ID"
  echo ""

  # Submit and wait for results
  if xcrun notarytool submit "$zip_path" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait 2>&1; then
    success "Notarization completed successfully"
  else
    error "Notarization failed"
    echo ""
    echo "To troubleshoot:"
    echo "  1. Check your Apple Developer account status"
    echo "  2. Verify your App-Specific Password is correct"
    echo "  3. Ensure your certificate hasn't expired or been revoked"
    echo ""
    exit 1
  fi
}

staple_binary() {
  info "Stapling notarization ticket..."

  if xcrun stapler staple "$BINARY_PATH" 2>&1; then
    success "Notarization ticket stapled successfully"
  else
    warn "Stapling not supported for bare binaries (this is expected)"
    info "The binary is still notarized — macOS will verify online via Gatekeeper"
  fi
}

verify_staple() {
  info "Verifying notarization..."
  if xcrun stapler validate "$BINARY_PATH" 2>&1; then
    success "Staple verification passed"
  else
    info "Staple verification skipped (bare binaries are verified online by Gatekeeper)"
  fi
}

###############################################################################
# Main
###############################################################################

main() {
  print_header
  print_requirements

  check_env_vars
  check_binary

  echo ""
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
  echo ""

  local signing_identity
  signing_identity=$(setup_certificate)

  echo ""
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
  echo ""

  sign_binary "$signing_identity"

  echo ""
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
  echo ""

  verify_signature
  display_signature

  echo ""
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
  echo ""

  local zip_path="${BINARY_PATH}.zip"
  TEMP_FILES+=("$zip_path")

  create_zip "$zip_path"
  submit_notarization "$zip_path"

  echo ""
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
  echo ""

  staple_binary
  verify_staple

  echo ""
  echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
  success "Code signing and notarization complete!"
  echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  info "Signed binary: $BINARY_PATH"
  info ""
  info "You can verify the signature with:"
  echo -e "  ${BLUE}codesign --verify --deep --strict $BINARY_PATH${NC}"
  echo ""
}

main "$@"
