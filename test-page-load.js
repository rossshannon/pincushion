#!/usr/bin/env node

/**
 * Simple smoke test to verify the page loads without JavaScript errors
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function startServer(port) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    const extname = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.map': 'application/json'
    };

    const contentType = contentTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          res.writeHead(404);
          res.end('404 Not Found');
        } else {
          res.writeHead(500);
          res.end('500 Internal Server Error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log('Test server started on port', port);
      resolve(server);
    });
  });
}

(async () => {
  const errors = [];
  const port = 8765;
  let server;

  try {
    // Start local server
    server = await startServer(port);

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Load the index page
    const url = `http://localhost:${port}/`;
    console.log('Loading page:', url);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    console.log('Page loaded successfully');

    // Wait a moment for any async errors
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (errors.length > 0) {
      console.error('\n❌ JavaScript errors detected:');
      errors.forEach(error => console.error('  -', error));
      process.exit(1);
    } else {
      console.log('✅ No JavaScript errors detected');
      process.exit(0);
    }

    await browser.close();

  } catch (error) {
    console.error('❌ Failed to load page:', error.message);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
})();
