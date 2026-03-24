import { applyCors, getApiBaseUrl, methodNotAllowed } from './_auth.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, req.method);

  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  if (!clientId) {
    return res.status(500).json({
      error: 'Missing GITHUB_CLIENT_ID configuration.',
    });
  }

  const redirectUri = `${getApiBaseUrl(req)}/api/github-callback`;
  const scope = String(process.env.GITHUB_OAUTH_SCOPE || 'public_repo read:user').trim();

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('prompt', 'consent');

  res.redirect(302, authUrl.toString());
}