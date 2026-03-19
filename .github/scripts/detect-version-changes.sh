#!/bin/bash

# Detect version changes and determine which components need releases
# Output to GITHUB_OUTPUT

set -e

detect_version_changes() {
    local repo_path="$1"
    local github_token="$2"
    local pr_ref="${GITHUB_REF#refs/heads/}"
    local compare_ref="HEAD~1"
    local default_branch="main"

    # Determine what to compare against
    if [[ "$pr_ref" != "$default_branch" ]]; then
        compare_ref="$pr_ref"
    fi

    # Get changed files
    echo "::group::Changed files"
    git diff --name-only "$compare_ref" HEAD
    echo "::endgroup::"

    local changed_versions=()
    local current_versions=()
    local changed_components=()

    # Detect changed VERSION files
    while IFS= read -r file; do
        if [[ "$file" == */VERSION ]]; then
            # Extract component path (everything before /VERSION)
            local component_path="${file%/*}"
            # Get directory name (last part)
            local component_name="${component_path##*/}"

            # Get new version
            local new_version
            new_version=$(cat "$file")

            # Validate version format
            if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
                echo "::warning::Invalid version format: $new_version in $file"
                continue
            fi

            # Store new version
            current_versions+=("$component_name|$new_version")

            # Check if this VERSION file was modified
            if git diff "$compare_ref" HEAD -- "$file" | grep -q ".VERSION"; then
                changed_versions+=("$component_name|$new_version")
            fi
        fi
    done < <(git diff --name-only "$compare_ref" HEAD)

    # For PRs, also check if VERSION files were added/modified in this PR
    if [[ "$pr_ref" != "$default_branch" ]]; then
        # Get the merge base or the branch's first commit
        local base_ref="origin/$default_branch"
        if git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
            base_ref="$base_ref"
        else
            base_ref="$compare_ref"
        fi

        while IFS= read -r file; do
            if [[ "$file" == */VERSION ]]; then
                local component_path="${file%/*}"
                local component_name="${component_path##*/}"
                local new_version
                new_version=$(cat "$file")

                if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
                    continue
                fi

                # Check if file is in the diff for this PR
                if git diff "$base_ref" HEAD -- "$file" | grep -q ".VERSION"; then
                    # Check if not already in changed_versions
                    local already_changed=0
                    for v in "${changed_versions[@]}"; do
                        if [[ "$v" == "$component_name|"* ]]; then
                            already_changed=1
                            break
                        fi
                    done

                    if [[ $already_changed -eq 0 ]]; then
                        changed_versions+=("$component_name|$new_version")
                    fi
                fi
            fi
        done < <(git diff --name-only "$base_ref" HEAD)
    fi

    echo "::group::Changed VERSION files"
    printf '%s\n' "${changed_versions[@]}"
    echo "::endgroup::"

    # Compare with existing releases if there are changed versions
    if [[ ${#changed_versions[@]} -gt 0 ]]; then
        # Setup gh CLI
        if ! command -v gh &> /dev/null; then
            echo "::error::gh CLI not found"
            exit 1
        fi

        gh auth login --with-token "$github_token" 2>/dev/null || true

        # Determine repository owner and name
        local repo_owner
        repo_owner=$(git config --get remote.origin.url | sed -E 's|.*github.com[/:]([^/]+)/.*|\1|')
        local repo_name
        repo_name=$(git config --get remote.origin.url | sed -E 's|.*github.com/[^/]*/([^/]+).*|\1|')

        # Get latest release tag
        local latest_release
        latest_release=$(gh release list --limit 1 --sort created --json tagName,name,publishedAt --jq '.[0].tagName')

        # Default branch for fetching tags
        local default_branch="main"
        gh sync-repo "$repo_owner/$repo_name" --branch "$default_branch" --setup-git-config --repo "$repo_owner/$repo_name" || true

        # Fetch tags
        gh fetch --tags

        # Get latest release tag (including pre-releases)
        latest_release=$(gh release list --limit 1 --sort publishedAt --json tagName,publishedAt --jq '.[0].tagName')

        # Define component paths
        declare -A component_dirs=(
            ["server"]="packages/server"
            ["client"]="packages/client"
            ["lsp"]="services/lsp"
        )

        declare -A component_releases=(
            ["server"]="server"
            ["client"]="client"
            ["lsp"]="lsp"
        )

        # Check each changed component
        for change in "${changed_versions[@]}"; do
            local component="${change%%|*}"
            local new_version="${change#*|}"

            # Skip tools (they're handled separately)
            if [[ "$component" == "tool-"* ]]; then
                continue
            fi

            # Get component path
            local component_path="${component_dirs[$component]}"
            if [[ -z "$component_path" ]]; then
                continue
            fi

            local release_prefix="${component_releases[$component]}"

            # Find existing release for this component
            local existing_release_tag="${release_prefix}/${new_version}"
            local existing_release=false

            if [[ -n "$latest_release" ]]; then
                # Get all tags related to this component
                local all_tags
                all_tags=$(gh api /repos/"$repo_owner"/"$repo_name"/tags --jq '.[] | .name' | grep "^${release_prefix}/")

                # Find the highest version
                local highest_version=""
                local highest_tag=""

                while IFS= read -r tag; do
                    local tag_version="${tag#$release_prefix/}"
                    if [[ -z "$highest_version" ]]; then
                        highest_version="$tag_version"
                        highest_tag="$tag"
                    else
                        if compare_versions "$tag_version" "$highest_version" > /dev/null; then
                            highest_version="$tag_version"
                            highest_tag="$tag"
                        fi
                    fi
                done <<< "$all_tags"

                # Check if this is a prerelease version
                local is_prerelease=false
                if [[ "$new_version" == *"-"* ]]; then
                    is_prerelease=true
                fi

                if [[ "$is_prerelease" == true ]]; then
                    # For prereleases, compare differently
                    if [[ -n "$highest_version" ]]; then
                        if compare_prerelease_versions "$new_version" "$highest_version" > /dev/null; then
                            existing_release=true
                        fi
                    fi
                else
                    # For regular releases, use normal comparison
                    if [[ -n "$highest_version" ]]; then
                        if compare_versions "$new_version" "$highest_version" > /dev/null; then
                            existing_release=true
                        fi
                    fi
                fi
            else
                # No existing releases - this is the first release
                existing_release=true
            fi

            if [[ "$existing_release" == true ]]; then
                echo "Version $new_version for $component is higher than existing release"
                changed_components+=("$release_prefix")
            else
                echo "Version $new_version for $component is NOT higher than existing release"
            fi
        done
    fi

    # Handle tools separately
    local tool_names=()
    local valid_tools=("apply-patch" "edit" "glob" "grep" "ls" "lsp" "multiedit" "read-file" "shell" "todoread" "todowrite" "webfetch" "write-file")

    for tool in "${valid_tools[@]}"; do
        local tool_version_file="tools/$tool/VERSION"
        if [[ -f "$tool_version_file" ]]; then
            local new_version
            new_version=$(cat "$tool_version_file")

            if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
                continue
            fi

            # Check if this VERSION file was modified
            if git diff "$compare_ref" HEAD -- "$tool_version_file" | grep -q ".VERSION"; then
                # Setup gh CLI for repository
                if ! command -v gh &> /dev/null; then
                    echo "::error::gh CLI not found"
                    exit 1
                fi

                gh auth login --with-token "$github_token" 2>/dev/null || true

                # Determine repository owner and name
                local repo_owner
                repo_owner=$(git config --get remote.origin.url | sed -E 's|.*github.com[/:]([^/]+)/.*|\1|')
                local repo_name
                repo_name=$(git config --get remote.origin.url | sed -E 's|.*github.com/[^/]*/([^/]+).*|\1|')

                # Get latest release tag
                local all_tags
                all_tags=$(gh api /repos/"$repo_owner"/"$repo_name"/tags --jq '.[] | .name' | grep "^tool-$tool/")

                # Find the highest version
                local highest_version=""
                local highest_tag=""

                while IFS= read -r tag; do
                    local tag_version="${tag#tool-$tool/}"
                    if [[ -z "$highest_version" ]]; then
                        highest_version="$tag_version"
                        highest_tag="$tag"
                    else
                        if compare_versions "$tag_version" "$highest_version" > /dev/null; then
                            highest_version="$tag_version"
                            highest_tag="$tag"
                        fi
                    fi
                done <<< "$all_tags"

                # Check if this is a prerelease version
                local is_prerelease=false
                if [[ "$new_version" == *"-"* ]]; then
                    is_prerelease=true
                fi

                if [[ -n "$all_tags" ]]; then
                    if [[ "$is_prerelease" == true ]]; then
                        if compare_prerelease_versions "$new_version" "$highest_version" > /dev/null; then
                            tool_names+=("$tool")
                        fi
                    else
                        if compare_versions "$new_version" "$highest_version" > /dev/null; then
                            tool_names+=("$tool")
                        fi
                    fi
                else
                    # No existing releases for this tool
                    tool_names+=("$tool")
                fi
            fi
        fi
    done

    # Output to GITHUB_OUTPUT
    if [[ ${#changed_components[@]} -gt 0 ]]; then
        echo "server=${changed_components[*]}"
    else
        echo "server="
    fi

    if [[ ${#changed_components[@]} -gt 0 ]]; then
        echo "client=${changed_components[*]}"
    else
        echo "client="
    fi

    if [[ ${#changed_components[@]} -gt 0 ]]; then
        echo "lsp=${changed_components[*]}"
    else
        echo "lsp="
    fi

    echo "tools=${tool_names[*]}"
}

# Helper functions for version comparison
compare_versions() {
    # Return 1 if v1 > v2, 0 if equal, -1 if v1 < v2
    local v1=$1
    local v2=$2

    # Remove leading 'v' if present
    v1=${v1#v}
    v2=${v2#v}

    # Split by dots
    local IFS='.'
    local i=1
    local n1=(${v1//[-_]/.})
    local n2=(${v2//[-_]/.})

    # Compare each part
    while [[ $i -le ${#n1[@]} ]] && [[ $i -le ${#n2[@]} ]]; do
        if [[ ${n1[$i]} -gt ${n2[$i]} ]]; then
            return 1
        elif [[ ${n1[$i]} -lt ${n2[$i]} ]]; then
            return -1
        fi
        i=$((i + 1))
    done

    # One version might have more parts
    if [[ $i -le ${#n1[@]} ]]; then
        return 1
    elif [[ $i -le ${#n2[@]} ]]; then
        return -1
    else
        return 0
    fi
}

compare_prerelease_versions() {
    local v1=$1
    local v2=$2

    # Split by dash
    local IFS='-'
    local p1=(${v1//[-_]/.})
    local p2=(${v2//[-_]/.})

    # Base version comparison
    local base1="${p1[0]}"
    local base2="${p2[0]}"

    local base_result=$(compare_versions "$base1" "$base2")
    if [[ $base_result -ne 0 ]]; then
        return $base_result
    fi

    # Prerelease comparison
    if [[ ${#p1[@]} -lt 2 ]]; then
        return 1  # No prerelease part means it's a full release
    fi
    if [[ ${#p2[@]} -lt 2 ]]; then
        return -1  # v2 is a full release, v1 is prerelease
    fi

    # Compare prerelease identifiers
    local i=1
    while [[ $i -lt ${#p1[@]} ]] && [[ $i -lt ${#p2[@]} ]]; do
        local part1="${p1[$i]}"
        local part2="${p2[$i]}"

        # Check if both are numeric
        if [[ "$part1" =~ ^[0-9]+$ ]] && [[ "$part2" =~ ^[0-9]+$ ]]; then
            if [[ $part1 -gt $part2 ]]; then
                return 1
            elif [[ $part1 -lt $part2 ]]; then
                return -1
            fi
        else
            # Lexicographic comparison
            if [[ "$part1" > "$part2" ]]; then
                return 1
            elif [[ "$part1" < "$part2" ]]; then
                return -1
            fi
        fi
        i=$((i + 1))
    done

    # Fewer prerelease parts is considered smaller
    if [[ $i -lt ${#p1[@]} ]]; then
        return -1
    elif [[ $i -lt ${#p2[@]} ]]; then
        return 1
    else
        return 0
    fi
}

# Run the main function
detect_version_changes
