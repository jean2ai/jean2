# file-to-markdown

Server tool for converting files to Markdown format. Supports a variety of document formats including Office documents (Word, Excel, PowerPoint), PDFs, HTML, ePub, and more.

This tool wraps the `filetomarkdown` npm package, created by Josef Nobach (jojomondag) - https://github.com/jojomondag/FileToMarkdown. It is inspired by Microsoft's [markitdown](https://github.com/microsoft/markitdown) Python tool.

## Requirements

- **Runtime**: `bun`
- **Post-install**: `bun install`

## Parameters

- `path` (required): The absolute path to the file to convert to Markdown

## Supported Formats

- Office documents: `.docx`, `.xlsx`, `.pptx`
- PDF documents: `.pdf`
- ePub ebooks: `.epub`
- HTML files: `.html`
- Markdown files: `.md`
- And more via `filetomarkdown`