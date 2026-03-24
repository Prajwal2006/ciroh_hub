import { applyCors, fetchGithubUser, getBearerToken, methodNotAllowed, unauthorized, verifyJwt } from './_auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, req.method);

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    return res.status(500).json({ error: 'Missing JWT_SECRET configuration.' });
  }

  const token = getBearerToken(req);
  if (!token) return unauthorized(res, 'Missing Bearer token.');

  let payload;
  try {
    payload = verifyJwt(token, jwtSecret);
  } catch {
    return unauthorized(res, 'Invalid or expired token.');
  }

  try {
    const user = await fetchGithubUser(payload.githubToken);
    return res.status(200).json({
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      email: user.email,
    });
  } catch (error) {
    return unauthorized(res, `Session invalid: ${String(error?.message || error)}`);
  }
}
