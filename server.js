/**
 * Local development API server.
 *
 * Serves the api/*.js Vercel-style serverless handler functions as Express
 * routes under /api/<endpoint>, so the GitHub OAuth flow works during local
 * development alongside `npm start` (Docusaurus, port 3000).
 *
 * Usage:
 *   node server.js          (default port 3001)
 *   PORT=3002 node server.js
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import * as url from 'url';
import * as path from 'path';

// Dynamically import handlers so their top-level env reads happen after dotenv
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const PORT = Number(process.env.API_PORT || 3001);
const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Map endpoint names to their handler modules
const endpoints = [
  'github-login',
  'github-callback',
  'me',
  'create-product-issue',
  'create-blog-issue',
];

// Mount each endpoint under /api/<name> for all HTTP methods
for (const name of endpoints) {
  const handlerPath = path.join(__dirname, 'api', `${name}.js`);

  app.all(`/api/${name}`, async (req, res) => {
    try {
      const mod = await import(handlerPath);
      const handler = mod.default || mod;
      await handler(req, res);
    } catch (err) {
      console.error(`[${name}] Handler error:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', details: String(err?.message || err) });
      }
    }
  });

  console.log(`Mounted: /api/${name}`);
}

app.listen(PORT, () => {
  console.log(`\n✅  CIROH Hub API server running at http://localhost:${PORT}`);
  console.log(`   Paired with Docusaurus at http://localhost:3000\n`);
});
