import {
  applyCors,
  createGithubIssue,
  getBearerToken,
  methodNotAllowed,
  readIssuePayload,
  unauthorized,
  verifyJwt,
} from './_auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, req.method);

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

  const { title, body } = readIssuePayload(req);
  if (!title || !body) {
    return res.status(400).json({ error: 'Both title and body are required.' });
  }

  try {
    const result = await createGithubIssue({
      githubToken: payload.githubToken,
      title,
      body,
      labels: [String(process.env.BLOG_ISSUE_LABEL || 'blog')],
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to create blog issue.',
      details: String(error?.message || error),
    });
  }
}
