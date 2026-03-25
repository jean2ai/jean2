#!/usr/bin/env bash

set -euo pipefail

VERSION_FILE_URL="https://raw.githubusercontent.com/rabbyte-tech/jean2/refs/heads/main/packages/server/VERSION"
REPO="rabbyte-tech/jean2"
RELEASE_API_URL="https://api.github.com/repos/${REPO}/releases"
INSTALL_DIR="${HOME}/.jean2/bin"
BINARY_NAME="jean2"
BINARY_PATH=""

FORCE=false
SKIP_PATH=false
SKIP_SHA256=false
CUSTOM_VERSION=""
CUSTOM_INSTALL_DIR=""
SHELL_CONFIG_FILE=""

TEMP_FILE=""

cleanup() {
  if [[ -n "${TEMP_FILE:-}" && -f "$TEMP_FILE" ]]; then
    rm -f "$TEMP_FILE"
  fi
}
trap cleanup EXIT

supports_color() {
  if [[ -z "${FORCE_COLOR:-}" ]] && [[ -t 1 ]]; then
    if command -v tput &>/dev/null && tput colors &>/dev/null; then
      [[ $(tput colors) -ge 8 ]]
    else
      [[ "${TERM:-}" == *color* ]] || [[ "${TERM:-}" == *xterm* ]] || [[ "${TERM:-}" == *screen* ]]
    fi
  else
    [[ "${FORCE_COLOR:-}" == "1" ]]
  fi
}

if supports_color; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  RED=""
  GREEN=""
  YELLOW=""
  CYAN=""
  NC=""
fi

error() {
  echo -e "${RED}error${NC}: $*" >&2
  exit 1
}

warn() {
  echo -e "${YELLOW}warning${NC}: $*"
}

info() {
  echo -e "${CYAN}info${NC}: $*"
}

success() {
  echo -e "${GREEN}${*}${NC}"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install Jean2 server binary from GitHub Releases.

OPTIONS:
  --version <ver>      Install a specific version (default: latest)
  --install-dir <path>  Install to custom directory (default: ~/.jean2/bin)
  --force              Reinstall even if binary exists
  --no-path            Skip adding to PATH
  --no-sha256          Skip SHA256 verification
  --help               Show this help message

EXAMPLES:
  $(basename "$0")                     # Install latest version
  $(basename "$0") --version 0.4.5     # Install specific version
  $(basename "$0") --force             # Reinstall current version
  $(basename "$0") --no-path           # Install without modifying PATH

EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        [[ $# -ge 2 ]] || error "--version requires an argument"
        CUSTOM_VERSION="$2"
        shift 2
        ;;
      --install-dir)
        [[ $# -ge 2 ]] || error "--install-dir requires an argument"
        CUSTOM_INSTALL_DIR="$2"
        shift 2
        ;;
      --force)
        FORCE=true
        shift
        ;;
      --no-path)
        SKIP_PATH=true
        shift
        ;;
      --no-sha256)
        SKIP_SHA256=true
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        error "Unknown option: $1"
        ;;
    esac
  done

  if [[ -n "${CUSTOM_INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$CUSTOM_INSTALL_DIR"
  fi
}

detect_os() {
  local os
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"

  case "$os" in
    darwin*)
      echo "darwin"
      ;;
    linux*)
      echo "linux"
      ;;
    *)
      error "Unsupported OS: $os. Only darwin and linux are supported."
      ;;
  esac
}

fetch_version() {
  local version
  info "Fetching latest version from VERSION file..."

  if ! version=$(curl -fsSL "$VERSION_FILE_URL" 2>/dev/null); then
    error "Failed to fetch VERSION file from GitHub. Please specify --version explicitly."
  fi

  version="${version//$'\r'/}"
  version="${version#"${version%%[![:space:]]*}"}"
  version="${version%"${version##*[![:space:]]}"}"

  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "Invalid version format from VERSION file: '$version'"
  fi

  echo "$version"
}

check_existing_install() {
  if [[ -f "$BINARY_PATH" ]]; then
    if [[ "$FORCE" == true ]]; then
      warn "Replacing existing installation at $BINARY_PATH"
    else
      local current_version
      current_version=$("$BINARY_PATH" --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
      success "Jean2 is already installed at $BINARY_PATH (version: $current_version)"
      info "Use --force to reinstall"
      exit 0
    fi
  fi
}

fetch_release_info() {
  local os="$1"
  local version="$2"
  local tag="server/v${version}"
  local release_url="${RELEASE_API_URL}/tags/${tag}"
  local asset_name="jean2-${os}"

  info "Fetching release info for $tag..."

  local response
  if ! response=$(curl -fsSL "$release_url" 2>/dev/null); then
    error "Failed to fetch release info. Check version or network connectivity."
  fi

  local download_url
  download_url=$(printf '%s\n' "$response" | grep -o "\"browser_download_url\": *\"[^\"]*${asset_name}\"" | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/' || true)

  if [[ -z "$download_url" ]]; then
    error "Binary asset '$asset_name' not found in release $tag"
  fi

  local digest
  if command -v python3 &>/dev/null; then
    digest=$(printf '%s\n' "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    if asset['name'] == '${asset_name}':
        print(asset.get('digest', ''))
        break
" 2>/dev/null || echo "")
  else
    warn "Could not determine SHA256 digest (python3 not available or digest not in release)"
    digest=""
  fi

  echo "${download_url}|${digest}"
}

download_binary() {
  local url="$1"
  local os="$2"

  info "Downloading Jean2 for $os..."
  info "URL: $url"

  TEMP_FILE=$(mktemp)

  if ! curl -fSL --progress-bar -o "$TEMP_FILE" "$url"; then
    error "Download failed"
  fi

  success "Download complete"
  echo "$TEMP_FILE"
}

verify_checksum() {
  local file="$1"
  local expected_digest="$2"

  if [[ -z "$expected_digest" ]]; then
    warn "Skipping checksum verification (no digest provided)"
    return 0
  fi

  info "Verifying SHA256 checksum..."

  local hash
  hash="sha256:$(shasum -a 256 "$file" | cut -d' ' -f1)"

  if [[ "$hash" != "$expected_digest" ]]; then
    local expected_hash="${expected_digest#sha256:}"
    error "Checksum mismatch!\n  Expected: $expected_hash\n  Actual:   ${hash#sha256:}"
  fi

  success "Checksum verified"
}

install_binary() {
  local file="$1"

  info "Installing to $BINARY_PATH..."

  mkdir -p "$(dirname "$BINARY_PATH")"

  if ! mv -f "$file" "$BINARY_PATH"; then
    error "Failed to install binary to $BINARY_PATH"
  fi

  if ! chmod +x "$BINARY_PATH"; then
    warn "Failed to make binary executable"
  fi

  success "Installed to $BINARY_PATH"
}

configure_path() {
  if [[ "$SKIP_PATH" == true ]]; then
    info "Skipping PATH configuration (--no-path specified)"
    return 0
  fi

  local shell_config=""
  local path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""

  case "${SHELL:-}" in
    *zsh*)
      if [[ -f "$HOME/.zshrc" ]]; then
        shell_config="$HOME/.zshrc"
      fi
      ;;
    *bash*)
      if [[ -f "$HOME/.bashrc" ]]; then
        shell_config="$HOME/.bashrc"
      elif [[ -f "$HOME/.bash_profile" ]]; then
        shell_config="$HOME/.bash_profile"
      fi
      ;;
  esac

  if [[ -z "$shell_config" ]]; then
    if [[ -f "$HOME/.zshrc" ]]; then
      shell_config="$HOME/.zshrc"
    elif [[ -f "$HOME/.bashrc" ]]; then
      shell_config="$HOME/.bashrc"
    elif [[ -f "$HOME/.bash_profile" ]]; then
      shell_config="$HOME/.bash_profile"
    elif [[ -f "$HOME/.profile" ]]; then
      shell_config="$HOME/.profile"
    fi
  fi

  SHELL_CONFIG_FILE="$shell_config"

  if [[ -z "$shell_config" ]]; then
    warn "No shell config file found. Manually add the following to your PATH:"
    info "$path_line"
    return 0
  fi

  if grep -qF "$INSTALL_DIR" "$shell_config" 2>/dev/null; then
    info "PATH already configured in $shell_config"
    return 0
  fi

  info "Adding Jean2 to PATH in $shell_config..."

  {
    echo ""
    echo "$path_line"
  } >> "$shell_config" && success "Added Jean2 to PATH in $shell_config" || warn "Failed to update $shell_config"
}

main() {
  parse_args "$@"

  local os
  os=$(detect_os)

  local version
  if [[ -n "$CUSTOM_VERSION" ]]; then
    version="$CUSTOM_VERSION"
    info "Using specified version: $version"
  else
    version=$(fetch_version)
    info "Using latest version: $version"
  fi

  BINARY_PATH="${INSTALL_DIR}/${BINARY_NAME}"

  check_existing_install

  local release_info
  release_info=$(fetch_release_info "$os" "$version")

  local download_url="${release_info%%|*}"
  local digest="${release_info#*|}"

  local temp_file
  temp_file=$(download_binary "$download_url" "$os")

  if [[ "$SKIP_SHA256" != true ]]; then
    verify_checksum "$temp_file" "$digest"
  fi

  install_binary "$temp_file"

  configure_path

  echo ""
  success "Jean2 v${version} installed successfully!"
  echo ""
  info "Binary location: $BINARY_PATH"
  echo ""

  if [[ "$SKIP_PATH" != true ]]; then
    echo "  Next steps:"
    echo "    1. Restart your terminal or run:"
    if [[ -n "${SHELL_CONFIG_FILE:-}" ]]; then
      echo -e "       source \"${SHELL_CONFIG_FILE}\""
    else
      echo -e "       export PATH=\"${INSTALL_DIR}:\$PATH\""
    fi
    echo -e "    2. Initialize: ${CYAN}${BINARY_PATH} init${NC}"
    echo -e "    3. Start:      ${CYAN}${BINARY_PATH} start${NC}"
  else
    echo "  Next steps:"
    echo "    1. Add to PATH: export PATH=\"$INSTALL_DIR:\$PATH\""
    echo -e "    2. Initialize: ${CYAN}${BINARY_PATH} init${NC}"
    echo -e "    3. Start:      ${CYAN}${BINARY_PATH} start${NC}"
  fi
  echo ""
}

main "$@"
