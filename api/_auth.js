import crypto from 'crypto';
import fetch from 'node-fetch';

const DEFAULT_REPO = 'CIROH-UA/ciroh_hub';
const DEFAULT_EXPIRES = '7d';

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseExpiresIn(input) {
  const value = String(input || DEFAULT_EXPIRES).trim();
  const match = value.match(/^(\d+)\s*([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  return amount * multipliers[unit];
}

export function signJwt(payload, secret, expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + parseExpiresIn(expiresIn),
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const unsigned = `${encodedHeader}.${encodedBody}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsigned}.${signature}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  const [encodedHeader, encodedBody, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expected) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedBody));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new Error('Token expired');
  }

  return payload;
}

export function getBearerToken(req) {
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

export function getRequestOrigin(req) {
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

function listAllowedOrigins() {
  const fromPrimary = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
  const fromCsv = String(process.env.FRONTEND_URLS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set([...fromPrimary, ...fromCsv])];
}

export function applyCors(req, res) {
  const requestOrigin = req?.headers?.origin;
  const allowedOrigins = listAllowedOrigins();

  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || '*';

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

export function getApiBaseUrl(req) {
  const explicit = String(process.env.API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return getRequestOrigin(req).replace(/\/+$/, '');
}

export function getFrontendTargetBase(req) {
  const origin = String(process.env.FRONTEND_URL || '').trim() || getRequestOrigin(req);
  const basePath = String(process.env.FRONTEND_BASE_PATH || '/local').trim();

  const safeOrigin = origin.replace(/\/+$/, '');
  const safePath = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';

  return `${safeOrigin}${safePath}`;
}

function parseJsonBody(req) {
  if (req?.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req?.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

export function readIssuePayload(req) {
  const body = parseJsonBody(req);
  return {
    title: String(body?.title || '').trim(),
    body: String(body?.body || '').trim(),
  };
}

export async function fetchGithubUser(githubToken) {
  const response = await fetch('https://api.github.com/user', {
    method: 'GET',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CIROH-Hub-Auth',
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to fetch GitHub user: ${details}`);
  }

  return response.json();
}

export async function createGithubIssue({ githubToken, title, body, labels = [] }) {
  const repo = String(process.env.GITHUB_REPO || DEFAULT_REPO).trim();
  const [owner, name] = repo.split('/');

  if (!owner || !name) {
    throw new Error('Invalid GITHUB_REPO value. Expected <owner>/<repo>.');
  }

  const requestIssue = async (payload) => {
    const response = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'CIROH-Hub-Issue-Creator',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `GitHub API failed with status ${response.status}`);
    }

    return response.json();
  };

  let labelsApplied = true;
  let issue;

  try {
    issue = await requestIssue({ title, body, labels });
  } catch (error) {
    const asText = String(error?.message || error);
    if (labels.length > 0 && /label|validation failed/i.test(asText)) {
      labelsApplied = false;
      issue = await requestIssue({ title, body });
    } else {
      throw error;
    }
  }

  return {
    issue: {
      url: issue.html_url,
      number: issue.number,
      repo,
    },
    labelsApplied,
  };
}

export function methodNotAllowed(res, method) {
  return res.status(405).json({ error: `Method ${method} not allowed.` });
}

export function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ error: message });
}