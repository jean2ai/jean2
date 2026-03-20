import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = __dirname; // CLI lives in dist, serve from same dir

const { values } = parseArgs({
  options: {
    port: {
      type: 'string',
      default: '3774',
    },
  },
  argv: process.argv.slice(2),
});

const PORT = parseInt(values.port, 10);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext as keyof typeof MIME_TYPES] || 'application/octet-stream';
}

function serveFile(res: http.ServerResponse, filePath: string, contentType: string): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath = (req.url ?? '/').split('?')[0];

  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = path.join(distPath, urlPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexPath = path.join(distPath, 'index.html');
      serveFile(res, indexPath, 'text/html');
      return;
    }

    const contentType = getContentType(filePath);
    serveFile(res, filePath, contentType);
  });
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Jean2 client running at ${url}`);

  open(url);
});

function shutdown() {
  console.log('\nShutting down...');
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
