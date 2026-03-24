# CIROH Hub - GitHub Login and Admin Submission Flow

This document describes the end-to-end auth flow used by CIROH Hub admin pages.

## Overview

1. User clicks "Login with GitHub" in the navbar.
2. Frontend sends user to `/api/github-login`.
3. API redirects to GitHub OAuth authorization.
4. GitHub redirects back to `/api/github-callback?code=...`.
5. Callback exchanges code for GitHub token, signs an app JWT, and redirects to `/admin?token=...`.
6. Frontend stores the JWT in `localStorage` (`ciroh_admin_jwt`) and uses it for API calls.
7. Admin forms call protected APIs (`/api/me`, `/api/create-product-issue`, `/api/create-blog-issue`) with `Authorization: Bearer <jwt>`.

## Required API Endpoints

- `GET /api/github-login`
- `GET /api/github-callback`
- `GET /api/me`
- `POST /api/create-product-issue`
- `POST /api/create-blog-issue`

## Required Environment Variables

These variables are required by the serverless API (`api/*.js`).

- `GITHUB_CLIENT_ID`: GitHub OAuth App client ID.
- `GITHUB_CLIENT_SECRET`: GitHub OAuth App client secret.
- `JWT_SECRET`: Secret used to sign and verify app JWTs.
- `GITHUB_REPO`: Target repo for issue creation (example: `CIROH-UA/ciroh_hub`).

## Optional Environment Variables

- `API_BASE_URL`: Public base URL for API callbacks (example: `https://hub.ciroh.org`).
- `FRONTEND_URL`: Frontend origin used for OAuth post-login redirect.
- `FRONTEND_BASE_PATH`: Frontend base path (default is `/local`).
- `FRONTEND_URLS`: Comma-separated allowed CORS origins.
- `GITHUB_OAUTH_SCOPE`: OAuth scope (default: `public_repo read:user`).
- `JWT_EXPIRES_IN`: JWT TTL (default: `7d`).
- `PRODUCT_ISSUE_LABEL`: Label used for product issues (default: `enhancement`).
- `BLOG_ISSUE_LABEL`: Label used for blog issues (default: `blog`).

## Local Development Checklist

1. Set `.env` using `.env.example` values.
2. Ensure GitHub OAuth app callback URL points to:
   - `http://localhost:3000/api/github-callback` (or your deployed API origin).
3. Start site with `npm start`.
4. Open the site and use navbar login.
5. Verify:
   - `/admin` loads authenticated user.
   - Product/blog form submissions create GitHub issues.

## Notes

- JWT is intentionally stored in `localStorage` to keep the flow stateless (no cookies required).
- If labels do not exist in the target repo, issue creation still succeeds without labels.
- If login loops, check that `JWT_SECRET` is set and callback origin matches your runtime URL.
