#!/bin/bash

# Detect version changes and determine which components need releases
# Output to GITHUB_OUTPUT

set -e

# Function to compare semantic versions
# Returns 0 if v1 == v2, 1 if v1 > v2, -1 if v1 < v2
compare_versions() {
    local v1="$1"
    local v2="$2"
    
    # Remove 'v' prefix if present
    v1="${v1#v}"
    v2="${v2#v}"
    
    # Handle prerelease versions
    local v1_pre=""
    local v2_pre=""
    local v1_base="$v1"
    local v2_base="$v2"
    
    if [[ "$v1" == *"-*" ]]; then
        v1_pre="${v1#*-}"
        v1_base="${v1%%-*}"
    fi
    if [[ "$v2" == *"-*" ]]; then
        v2_pre="${v2#*-}"
        v2_base="${v2%%-*}"
    fi
    
    # Compare base versions first
    local IFS='.'
    read -ra v1_parts <<< "$v1_base"
    read -ra v2_parts <<< "$v2_base"
    
    for i in 0 1 2; do
        local n1=${v1_parts[$i]:-0}
        local n2=${v2_parts[$i]:-0}
        
        if [[ $n1 -gt $n2 ]]; then
            return 0
        elif [[ $n1 -lt $n2 ]]; then
            return -1
        fi
    done
    
    # Base versions are equal, compare prerelease
    if [[ -n "$v1_pre" ]] && [[ -n "$v2_pre" ]]; then
        return 0
    elif [[ -n "$v1_pre" ]] && [[ -z "$v2_pre" ]]; then
        return -1  # v1 has prerelease, v2 doesn't
    elif [[ -z "$v1_pre" ]] && [[ -n "$v2_pre" ]]; then
        return 0  # v1 is full release, v2 is prerelease
    else
        # Both have prerelease, compare them
        [[ "$v1_pre" > "$v2_pre" ]] && return 0
        [[ "$v1_pre" < "$v2_pre" ]] && return -1
        return 0
    fi
}

# Check if a version is higher than existing release
is_version_higher() {
    local new_version="$1"
    local existing_version="$2"
    
    # No existing version means this is a new release
    if [[ -z "$existing_version" ]]; then
        return 0
    fi
    
    compare_versions "$new_version" "$existing_version"
}

# Get existing release version for a component
get_existing_version() {
    local tag_prefix="$1"
    local existing_version=""
    
    # Get all releases with this prefix
    local releases
    releases=$(gh release list --limit 100 --json tagName 2>/dev/null | jq -r ".[] | select(.tagName | startswith(\"$tag_prefix/\"))" || true)
    
    if [[ -n "$releases" ]]; then
        # Find the highest version
        local highest_version=""
        while IFS= read -r tag; do
            local version="${tag#$tag_prefix/}"
            if [[ -z "$highest_version" ]] || [[ $(is_version_higher "$version" "$highest_version") -eq 0 ]]; then
                highest_version="$version"
            fi
        done <<< "$releases"
        
        echo "$highest_version"
    fi
}

# Main detection logic
main() {
    local has_server=""
    local has_client=""
    local has_lsp=""
    local tools_json="[]"
    
    # Get changed VERSION files
    local changed_files
    changed_files=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
    
    # Check each component
    # Server
    if echo "$changed_files" | grep -q "^packages/server/VERSION$"; then
        local new_version
        new_version=$(cat packages/server/VERSION 2>/dev/null | tr -d '[:space:]')
        
        if [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            local existing_version
            existing_version=$(get_existing_version "server")
            
            if [[ $(is_version_higher "$new_version" "$existing_version") -eq 0 ]]; then
                has_server="server/v$new_version"
                echo "::notice::Server version bumped: $existing_version -> $new_version"
            fi
        fi
    fi
    
    # Client
    if echo "$changed_files" | grep -q "^packages/client/VERSION$"; then
        local new_version
        new_version=$(cat packages/client/VERSION 2>/dev/null | tr -d '[:space:]')
        
        if [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            local existing_version
            existing_version=$(get_existing_version "client")
            
            if [[ $(is_version_higher "$new_version" "$existing_version") -eq 0 ]]; then
                has_client="client/v$new_version"
                echo "::notice::Client version bumped: $existing_version -> $new_version"
            fi
        fi
    fi
    
    # LSP
    if echo "$changed_files" | grep -q "^services/lsp/VERSION$"; then
        local new_version
        new_version=$(cat services/lsp/VERSION 2>/dev/null | tr -d '[:space:]')
        
        if [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            local existing_version
            existing_version=$(get_existing_version "lsp")
            
            if [[ $(is_version_higher "$new_version" "$existing_version") -eq 0 ]]; then
                has_lsp="lsp/v$new_version"
                echo "::notice::LSP version bumped: $existing_version -> $new_version"
            fi
        fi
    fi
    
    # Tools
    local valid_tools=("apply-patch" "edit" "glob" "grep" "ls" "lsp" "multiedit" "read-file" "shell" "todoread" "todowrite" "webfetch" "write-file")
    local tools_to_release=()
    
    for tool in "${valid_tools[@]}"; do
        if echo "$changed_files" | grep -q "^tools/$tool/VERSION$"; then
            local new_version
            new_version=$(cat "tools/$tool/VERSION" 2>/dev/null | tr -d '[:space:]')
            
            if [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
                local existing_version
                existing_version=$(get_existing_version "tool-$tool")
                
                if [[ $(is_version_higher "$new_version" "$existing_version") -eq 0 ]]; then
                    tools_to_release+=("$tool")
                    echo "::notice::Tool $tool version bumped: $existing_version -> $new_version"
                fi
            fi
        fi
    done
    
    # Build tools JSON array
    if [[ ${#tools_to_release[@]} -gt 0 ]]; then
        tools_json=$(printf '%s\n' "${tools_to_release[@]}" | jq -R . | jq -s .)
    fi
    
    # Output results
    echo "server=$has_server"
    echo "client=$has_client"
    echo "lsp=$has_lsp"
    echo "tools=$tools_json"
}

# Run main
main