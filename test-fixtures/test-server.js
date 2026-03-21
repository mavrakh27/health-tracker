// test-fixtures/test-server.js — In-process static file server for tests
// Replaces `python -m http.server 8080` — dies with the node process, no zombies.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
};

function startServer(rootDir, port = 8080) {
  const root = path.resolve(rootDir);

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const filePath = path.join(root, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({ server, url: `http://localhost:${port}`, close: () => server.close() });
    });
  });
}

module.exports = { startServer };
