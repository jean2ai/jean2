# Tools

Install tools into `~/.jean2/tools/`. Tools are language-agnostic — no external runtime is needed, npm is built into the server binary.

The recommended way to install tools is via the CLI:

```bash
jean2 tools install --all        # Install all available tools
jean2 tools install --name edit  # Install a specific tool
```

Alternatively, copy and run the manual commands below.

## apply-patch v0.2.1
Apply unified diff patches to files atomically.

```bash
mkdir -p ~/.jean2/tools/apply-patch && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-apply-patch%2Fv0.2.1/apply-patch.tar.gz | tar -xz -C ~/.jean2/tools/apply-patch --strip-components=1
```

## edit v0.2.1
String replacements in files with fuzzy matching.

```bash
mkdir -p ~/.jean2/tools/edit && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-edit%2Fv0.2.1/edit.tar.gz | tar -xz -C ~/.jean2/tools/edit --strip-components=1
```

## glob v0.2.2
Find files matching glob patterns.

```bash
mkdir -p ~/.jean2/tools/glob && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-glob%2Fv0.2.2/glob.tar.gz | tar -xz -C ~/.jean2/tools/glob --strip-components=1
```

## grep v0.2.3
Search file contents using regular expressions.

```bash
mkdir -p ~/.jean2/tools/grep && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-grep%2Fv0.2.3/grep.tar.gz | tar -xz -C ~/.jean2/tools/grep --strip-components=1
```

## ls v0.3.0
List directory contents with tree formatting.

```bash
mkdir -p ~/.jean2/tools/ls && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-ls%2Fv0.3.0/ls.tar.gz | tar -xz -C ~/.jean2/tools/ls --strip-components=1
```

## multiedit v0.2.1
Multiple string replacements in a single file.

```bash
mkdir -p ~/.jean2/tools/multiedit && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-multiedit%2Fv0.2.1/multiedit.tar.gz | tar -xz -C ~/.jean2/tools/multiedit --strip-components=1
```

## question v0.1.0
Ask users structured questions (forms, selects, confirmations) via the Ask protocol.

```bash
mkdir -p ~/.jean2/tools/question && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-question%2Fv0.1.0/question.tar.gz | tar -xz -C ~/.jean2/tools/question --strip-components=1
```

## read-file v0.2.2
Read files or list directories.

```bash
mkdir -p ~/.jean2/tools/read-file && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-read-file%2Fv0.2.2/read-file.tar.gz | tar -xz -C ~/.jean2/tools/read-file --strip-components=1
```

## shell v0.2.1
Execute arbitrary shell commands.

```bash
mkdir -p ~/.jean2/tools/shell && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-shell%2Fv0.2.1/shell.tar.gz | tar -xz -C ~/.jean2/tools/shell --strip-components=1
```

## todoread v0.2.1
Read the task list for the current session.

```bash
mkdir -p ~/.jean2/tools/todoread && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-todoread%2Fv0.2.1/todoread.tar.gz | tar -xz -C ~/.jean2/tools/todoread --strip-components=1
```

## todowrite v0.2.1
Write/replace the entire task list.

```bash
mkdir -p ~/.jean2/tools/todowrite && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-todowrite%2Fv0.2.1/todowrite.tar.gz | tar -xz -C ~/.jean2/tools/todowrite --strip-components=1
```

## webfetch v0.2.2
Fetch content from a URL and convert to readable format.

```bash
mkdir -p ~/.jean2/tools/webfetch && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-webfetch%2Fv0.2.2/webfetch.tar.gz | tar -xz -C ~/.jean2/tools/webfetch --strip-components=1
```

## write-file v0.2.1
Write content to a file.

```bash
mkdir -p ~/.jean2/tools/write-file && curl -L https://github.com/rabbyte-tech/jean2/releases/download/tool-write-file%2Fv0.2.1/write-file.tar.gz | tar -xz -C ~/.jean2/tools/write-file --strip-components=1
```
