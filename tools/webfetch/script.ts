import TurndownService from "turndown";
import { mkdirSync, writeFileSync } from 'node:fs';

interface Input {
  url: string;
  format?: "markdown" | "text" | "html";
  timeout?: number;
  sessionId?: string;
}

interface Output {
  content?: string;
  title?: string;
  contentType?: string;
  error?: string;
  _persisted?: boolean;
  _filePath?: string;
  _originalSize?: number;
  _visualization?: {
    type: "none";
    message: string;
  };
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30; // 30 seconds
const MAX_TIMEOUT = 120; // 2 minutes

const PERSIST_THRESHOLD = 50_000;
const PREVIEW_CHARS = 10_000;
const JEAN2_TEMP_PREFIX = '/tmp/jean2/';

const input: Input = JSON.parse(await Bun.stdin.text());
const { url, format = "markdown", timeout, sessionId } = input;

// Validate URL
if (!url.startsWith("http://") && !url.startsWith("https://")) {
  const output: Output = { error: "URL must start with http:// or https://" };
  console.log(JSON.stringify(output));
  process.exit(0);
}

const timeoutSeconds = Math.min(timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
const timeoutMs = timeoutSeconds * 1000;

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const output: Output = { error: `Request failed with status code: ${response.status}` };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = response.headers.get("content-length");
  
  // Check content length header if present
  if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
    const output: Output = { error: `Response too large: ${contentLength} bytes (max 5MB)` };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  const content = await response.text();

  // Check actual content size
  if (content.length > MAX_RESPONSE_SIZE) {
    const output: Output = { error: `Response too large: ${content.length} bytes (max 5MB)` };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  // Extract title from HTML if present
  let title = url;
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Process based on format and content type
  let outputContent: string;

  if (format === "html") {
    // Return raw HTML
    outputContent = content;
  } else if (format === "markdown" && contentType.includes("text/html")) {
    // Convert HTML to markdown
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    turndown.remove(["script", "style", "meta", "link", "iframe", "noscript"]);
    outputContent = turndown.turndown(content);
  } else if (format === "text" && contentType.includes("text/html")) {
    // Strip HTML tags and decode entities
    outputContent = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    // Return content as-is for non-HTML content or when format is irrelevant
    outputContent = content;
  }

  if (outputContent.length > PERSIST_THRESHOLD && sessionId) {
    const dir = `${JEAN2_TEMP_PREFIX}${sessionId}`;
    mkdirSync(dir, { recursive: true });

    const safeName = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const filePath = `${dir}/webfetch-${safeName}-${Date.now()}.md`;
    writeFileSync(filePath, outputContent);

    const preview = outputContent.slice(0, PREVIEW_CHARS);
    const displayUrl = url.length > 80 ? url.substring(0, 77) + '...' : url;

    const output: Output = {
      content: preview + `\n\n---\n[Content truncated: ${outputContent.length} chars total. Full content saved to ${filePath}. Use read-file tool to read more.]`,
      title,
      contentType,
      _persisted: true,
      _filePath: filePath,
      _originalSize: outputContent.length,
      _visualization: {
        type: "none",
        message: `Fetched: ${displayUrl} (${outputContent.length} chars, persisted)`,
      },
    };
    console.log(JSON.stringify(output));
  } else {
    const displayUrl = url.length > 80 ? url.substring(0, 77) + '...' : url;

    const output: Output = {
      content: outputContent,
      title,
      contentType,
      _visualization: {
        type: "none",
        message: `Fetched: ${displayUrl}`,
      },
    };
    console.log(JSON.stringify(output));
  }
} catch (e) {
  clearTimeout(timeoutId);
  const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
  const output: Output = { error: errorMessage };
  console.log(JSON.stringify(output));
}
