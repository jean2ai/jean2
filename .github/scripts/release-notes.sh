#!/bin/bash

# Generate release notes for a component
# Reads README.md from component and generates formatted release notes

set -e

generate_release_notes() {
    local component_name="$1"
    local component_version="$2"
    local component_path="$3"

    if [[ ! -d "$component_path" ]]; then
        echo "::error::Component path does not exist: $component_path"
        exit 1
    fi

    local readme_file="$component_path/README.md"
    local release_notes="## Release $component_version"

    if [[ -f "$readme_file" ]]; then
        local readme_content
        readme_content=$(cat "$readme_file")

        # Extract installation instructions (look for "## Installation" or similar)
        local install_section
        install_section=$(echo "$readme_content" | awk '/## Installation/,/## /' | head -n -1)

        if [[ -n "$install_section" ]]; then
            release_notes+="

### Installation

$install_section"
        fi
    fi

    # Check if it's a tool
    if [[ "$component_name" == "tool-"* ]]; then
        release_notes+="

**Note:** This is a standalone tool bundle. Download and extract the archive, then use the tool directly."
    fi

    echo "$release_notes"
}

# Run the function if arguments are provided
if [[ $# -ge 3 ]]; then
    generate_release_notes "$1" "$2" "$3"
fi
