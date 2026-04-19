# file-to-markdown

Server tool for converting files to Markdown format. Supports document formats including Office documents (Word, Excel, PowerPoint), PDFs, and LibreOffice documents.

This tool wraps the `filetomarkdown` npm package, created by Josef Nobach (jojomondag) - https://github.com/jojomondag/FileToMarkdown. It is inspired by Microsoft's [markitdown](https://github.com/microsoft/markitdown) Python tool.

## Requirements

- **Runtime**: `node`
- **Post-install**: `npm install`

## Parameters

- `path` (required): The absolute path to the file to convert to Markdown
- `offset` (optional): The line number to start reading from (1-indexed)
- `limit` (optional): Maximum number of lines to return (defaults to 2000)

## Supported Formats

- Office documents: `.docx`, `.xlsx`, `.pptx`
- PDF documents: `.pdf`
- LibreOffice: `.odt`, `.ods`, `.odp`
- Archives: `.zip`, `.7z`
