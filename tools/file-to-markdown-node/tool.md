---
name: file-to-markdown
script: script.mjs
runtime: node
securityScript: security.mjs
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "The absolute path to the file to convert to Markdown"
    offset:
      type: number
      description: "The line number to start reading from (1-indexed)"
    limit:
      type: number
      description: "The maximum number of lines to read (defaults to 2000)"
  required:
    - path
outputSchema:
  type: object
  properties:
    content:
      type: string
      description: "The file contents converted to Markdown format with line numbers"
    cachePath:
      type: string
      description: "Path to the cached markdown file in session temp storage"
    error:
      type: string
      description: "Error message if conversion failed"
timeout: 60000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

# file-to-markdown

Converts files to Markdown format using the `filetomarkdown` npm package, with support for 60+ file formats. Conversion results are cached in session temp storage — subsequent reads of unchanged files skip conversion entirely.

## When to Use

- Converting PDF documents to readable markdown
- Extracting content from Office documents (Word, Excel, PowerPoint)
- Reading LibreOffice documents (odt, ods, odp)
- Extracting content from archive files (zip, 7z)
- Reading binary files that don't have a plain-text representation

## When NOT to Use

- Plain text files (.txt, .md) — use `read-file` instead for better performance
- Fetching content from URLs — use `webfetch` instead
- Creating or writing files — use `write-file` instead

## Supported File Types

### Documents
- PDF documents
- Microsoft Office: `.docx`, `.xlsx`, `.pptx`
- LibreOffice: `.odt`, `.ods`, `.odp`

### Archives
- `.zip`, `.7z` (extracts content from contained files)

## Usage

- **path** (required): The absolute path to the file to convert
- **offset** (optional): The line number to start from (1-indexed). Use to continue reading large outputs.
- **limit** (optional): Maximum number of lines to return (defaults to 2000)

## Caching

- Converted files are cached in session temp storage (alongside other Jean2 temp files)
- Cache is keyed by a fast checksum of the source file's path, size, and modification time
- When the source file changes, a fresh conversion is performed automatically
- Cache files are invisible to the user and cleaned up with the session
- Use `cachePath` in the output to grep or read the full converted content directly

## Output Format

- Converted content is prefixed with line numbers as `<line>: <content>`
- Lines longer than 2000 characters are truncated
- If the output is truncated, use the `offset` parameter to continue reading

Best practices:
- For large documents, the output will be paginated — use `offset` to read subsequent sections
- Use `read-file` for plain text files — it's faster and doesn't require conversion
- Maximum supported file size is 50MB
