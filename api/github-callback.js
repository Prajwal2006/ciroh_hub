import fetch from 'node-fetch';
import { applyCors, fetchGithubUser, getApiBaseUrl, getFrontendTargetBase, methodNotAllowed, signJwt } from './_auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, req.method);

  const code = String(req?.query?.code || '').trim();
  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code.' });
  }

  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();

  if (!clientId || !clientSecret || !jwtSecret) {
    return res.status(500).json({
      error: 'Missing OAuth/JWT server configuration.',
    });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${getApiBaseUrl(req)}/api/github-callback`,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData?.access_token) {
      return res.status(401).json({
        error: 'GitHub OAuth exchange failed.',
        details: tokenData,
      });
    }

    const githubToken = tokenData.access_token;
    const user = await fetchGithubUser(githubToken);

    const appToken = signJwt(
      {
        githubToken,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
      },
      jwtSecret,
    );

    const frontendBase = getFrontendTargetBase(req);
    const redirect = `${frontendBase}/admin?token=${encodeURIComponent(appToken)}`;
    return res.redirect(302, redirect);
  } catch (error) {
    return res.status(500).json({
      error: 'OAuth callback failed.',
      details: String(error?.message || error),
    });
  }
}