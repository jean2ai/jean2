#!/bin/bash

# Main release script for building and releasing components
# Usage: bash .github/scripts/release.sh <component> [force]

set -e

COMPONENT="$1"
FORCE_RELEASE="${FORCE_RELEASE:-false}"
TOOL_NAMES="${TOOL_NAMES:-}"

RELEASE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$RELEASE_SCRIPT_DIR")"

# Define component paths
declare -A COMPONENT_PATHS=(
    ["server"]="packages/server"
    ["client"]="packages/client"
    ["lsp"]="services/lsp"
)

declare -A COMPONENT_TYPE=(
    ["server"]="server"
    ["client"]="client"
    ["lsp"]="lsp"
)

# Validate component
if [[ -z "$COMPONENT" ]]; then
    echo "::error::Component not specified"
    exit 1
fi

# Handle tools
if [[ "$COMPONENT" == "tools" ]]; then
    if [[ -z "$TOOL_NAMES" ]]; then
        echo "::error::Tool names not specified"
        exit 1
    fi

    IFS=',' read -ra TOOL_ARRAY <<< "$TOOL_NAMES"
    for tool in "${TOOL_ARRAY[@]}"; do
        tool=$(echo "$tool" | xargs)
        if [[ -n "$tool" ]]; then
            run_tool_release "$tool"
        fi
    done
    exit 0
fi

# Run component release
if [[ -n "${COMPONENT_PATHS[$COMPONENT]}" ]]; then
    run_component_release "$COMPONENT"
else
    echo "::error::Unknown component: $COMPONENT"
    exit 1
fi

run_component_release() {
    local component="$1"
    local component_path="${COMPONENT_PATHS[$component]}"
    local release_prefix="${COMPONENT_TYPE[$component]}"

    if [[ ! -d "$REPO_ROOT/$component_path" ]]; then
        echo "::error::Component path not found: $component_path"
        exit 1
    fi

    # Read version
    local version_file="$REPO_ROOT/$component_path/VERSION"
    if [[ ! -f "$version_file" ]]; then
        echo "::error::VERSION file not found: $version_file"
        exit 1
    fi

    local version
    version=$(cat "$version_file")

    # Validate version format
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        echo "::error::Invalid version format: $version"
        exit 1
    fi

    local release_tag="${release_prefix}/${version}"
    local is_prerelease=false

    if [[ "$version" == *"-"* ]]; then
        is_prerelease=true
    fi

    # Get latest release tag
    local latest_tag
    latest_tag=$(gh release list --limit 1 --sort publishedAt --json tagName --jq '.[0].tagName' 2>/dev/null || echo "")

    # Check if release already exists
    local existing_release=false
    if [[ -n "$latest_tag" ]]; then
        if [[ "$latest_tag" == "$release_tag" ]]; then
            if [[ "$FORCE_RELEASE" != "true" ]]; then
                echo "::warning::Release $release_tag already exists"
                echo "::notice::Use FORCE_RELEASE=true to force the release"
                exit 0
            fi
            existing_release=true
        fi
    fi

    # Determine what to compare against
    local compare_ref="HEAD~1"
    local pr_ref="${GITHUB_REF#refs/heads/}"
    local default_branch="main"

    if [[ "$pr_ref" != "$default_branch" ]]; then
        compare_ref="$pr_ref"
    fi

    # Check if version was actually changed
    local version_changed=false
    while IFS= read -r file; do
        if [[ "$file" == "$version_file" ]]; then
            version_changed=true
            break
        fi
    done < <(git diff "$compare_ref" HEAD --name-only)

    if [[ "$version_changed" == false ]] && [[ "$FORCE_RELEASE" != "true" ]]; then
        echo "::warning::Version $version was not changed (git diff is empty)"
        exit 0
    fi

    echo "::group::Releasing $component $version"
    echo "Release tag: $release_tag"
    echo "Force release: $FORCE_RELEASE"
    echo "Is prerelease: $is_prerelease"
    echo "::endgroup::"

    # Generate release notes
    local release_notes
    release_notes=$(bash "$RELEASE_SCRIPT_DIR/release-notes.sh" "$component" "$version" "$REPO_ROOT/$component_path")

    # Create release
    echo "Creating release..."
    gh release create "$release_tag" \
        --title "$component $version" \
        --notes "$release_notes" \
        --prerelease "$is_prerelease" \
        --target "$compare_ref"

    # Build and attach binaries
    if [[ "$component" == "client" ]]; then
        build_and_attach_client "$release_tag" "$version"
    else
        build_and_attach_component "$release_tag" "$version" "$component"
    fi

    echo "::notice::Release $release_tag created successfully"
}

run_tool_release() {
    local tool="$1"
    local tool_path="tools/$tool"
    local release_prefix="tool-$tool"

    if [[ ! -d "$REPO_ROOT/$tool_path" ]]; then
        echo "::error::Tool path not found: $tool_path"
        exit 1
    fi

    # Read version
    local version_file="$REPO_ROOT/$tool_path/VERSION"
    if [[ ! -f "$version_file" ]]; then
        echo "::error::VERSION file not found: $version_file"
        exit 1
    fi

    local version
    version=$(cat "$version_file")

    # Validate version format
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        echo "::error::Invalid version format: $version"
        exit 1
    fi

    local release_tag="${release_prefix}/${version}"
    local is_prerelease=false

    if [[ "$version" == *"-"* ]]; then
        is_prerelease=true
    fi

    # Get latest release tag
    local latest_tag
    latest_tag=$(gh release list --limit 1 --sort publishedAt --json tagName --jq '.[0].tagName' 2>/dev/null || echo "")

    # Check if release already exists
    if [[ -n "$latest_tag" ]]; then
        if [[ "$latest_tag" == "$release_tag" ]]; then
            if [[ "$FORCE_RELEASE" != "true" ]]; then
                echo "::warning::Release $release_tag already exists"
                echo "::notice::Use FORCE_RELEASE=true to force the release"
                exit 0
            fi
        fi
    fi

    # Determine what to compare against
    local compare_ref="HEAD~1"
    local pr_ref="${GITHUB_REF#refs/heads/}"
    local default_branch="main"

    if [[ "$pr_ref" != "$default_branch" ]]; then
        compare_ref="$pr_ref"
    fi

    # Check if version was actually changed
    local version_changed=false
    while IFS= read -r file; do
        if [[ "$file" == "$version_file" ]]; then
            version_changed=true
            break
        fi
    done < <(git diff "$compare_ref" HEAD --name-only)

    if [[ "$version_changed" == false ]] && [[ "$FORCE_RELEASE" != "true" ]]; then
        echo "::warning::Version $version was not changed (git diff is empty)"
        exit 0
    fi

    echo "::group::Releasing tool $tool $version"
    echo "Release tag: $release_tag"
    echo "Force release: $FORCE_RELEASE"
    echo "Is prerelease: $is_prerelease"
    echo "::endgroup::"

    # Generate release notes
    local release_notes
    release_notes=$(bash "$RELEASE_SCRIPT_DIR/release-notes.sh" "tool-$tool" "$version" "$REPO_ROOT/$tool_path")

    # Create release
    echo "Creating release..."
    gh release create "$release_tag" \
        --title "$tool $version" \
        --notes "$release_notes" \
        --prerelease "$is_prerelease" \
        --target "$compare_ref"

    # Create tool bundle
    create_tool_bundle "$release_tag" "$version" "$tool_path"

    echo "::notice::Release $release_tag created successfully"
}

build_and_attach_component() {
    local release_tag="$1"
    local version="$2"
    local component="$3"

    echo "Building $component..."

    if [[ "$component" == "server" ]]; then
        build_server
    elif [[ "$component" == "lsp" ]]; then
        build_lsp
    else
        echo "::error::Unknown component type: $component"
        exit 1
    fi

    echo "Attaching binaries to release $release_tag"
    gh release upload "$release_tag" \
        "dist/${component}-bun-linux-x64" \
        "dist/${component}-bun-darwin-arm64"
}

build_and_attach_client() {
    local release_tag="$1"
    local version="$2"

    echo "Building client..."

    cd "$REPO_ROOT/packages/client"
    bun run tauri build --target aarch64-apple-darwin
    cd "$REPO_ROOT"

    echo "Attaching binaries to release $release_tag"
    gh release upload "$release_tag" \
        "packages/client/src-tauri/target/aarch64-apple-darwin/bundle/dmg/Jean2-${version}_aarch64.dmg"
}

build_server() {
    echo "Building server..."
    cd "$REPO_ROOT/packages/server"
    bun build --compile --target=bun-darwin-arm64 --outfile=dist/bun-darwin-arm64 index.ts
    bun build --compile --target=bun-linux-x64 --outfile=dist/bun-linux-x64 index.ts
    cd "$REPO_ROOT"
}

build_lsp() {
    echo "Building LSP..."
    cd "$REPO_ROOT/services/lsp"
    bun build --compile --target=bun-darwin-arm64 --outfile=dist/bun-darwin-arm64 index.ts
    bun build --compile --target=bun-linux-x64 --outfile=dist/bun-linux-x64 index.ts
    cd "$REPO_ROOT"
}

create_tool_bundle() {
    local release_tag="$1"
    local version="$2"
    local tool_path="$3"

    local tool_name="${tool_path##*/}"

    echo "Creating tool bundle: $tool_name-$version.tar.gz"

    local bundle_name="${tool_name}-${version}.tar.gz"
    local bundle_dir="dist/${tool_name}-${version}"

    rm -rf "$bundle_dir"
    mkdir -p "$bundle_dir"

    # Create a clean bundle using git archive
    cd "$REPO_ROOT"
    git archive --format=tar --output="$bundle_dir.tar" "HEAD:${tool_path}"
    cd -

    # Extract the archive
    tar -xvf "$bundle_dir.tar" -C "$bundle_dir"

    # Add VERSION file
    cp "${REPO_ROOT}/${tool_path}/VERSION" "$bundle_dir/VERSION"

    # Create tar.gz
    cd "$bundle_dir"
    tar -czvf "../$bundle_name" .
    cd ..

    # Clean up
    rm -rf "$bundle_dir"
    rm -f "$bundle_dir.tar"

    # Upload the bundle
    gh release upload "$release_tag" "$REPO_ROOT/$bundle_name"
}
