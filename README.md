# MSAI Website

The site is split into two workspace projects:

- `fd/` — Next.js frontend.
- `bd/` — Node.js/Express backend, MongoDB, admin sessions, and Cloudinary upload signing.

## Local development

1. Keep backend credentials in `bd/.env.local`. Start from `bd/.env.example` if setting up a new machine. The backend also loads `bd/.env` as a fallback. Do not copy backend secrets into the frontend.
2. Set `ADMIN_PASSWORD` and an `ADMIN_SESSION_SECRET` with at least 32 characters in `bd/.env.local`.
3. Configure Gmail API OAuth credentials in `bd/.env.local` to send admission tickets: `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`. This sends from Gmail over HTTPS and does not require owning a custom domain.
4. Keep `NEXT_PUBLIC_API_URL=http://localhost:4000` in `fd/.env.local`.
5. From the repository root, run `npm install` once, then `npm run dev`.
6. Open the frontend URL printed by Next.js and visit `/admin` to edit the event.

The backend defaults to port `4000` and allows the local frontend origins on ports `3000` and `3001`. If Next.js chooses another port, add that origin to `FRONTEND_ORIGINS` in `bd/.env.local`.

## Production

Deploy the frontend on Vercel and the backend as a Render web service from the same GitHub repository:

### Frontend project

Set the project root to `fd/` and use the Next.js preset. Set `NEXT_PUBLIC_API_URL` to the Render backend's public HTTPS URL in the Vercel **Production** environment. This variable is embedded at build time, so redeploy after changing it. Admin requests are proxied through the frontend origin so browsers can reliably retain the admin session cookie.

### Backend service

Create a **Web Service** in Render and connect this repository. Leave the root directory as `.` so Render can access the root npm workspace and lockfile. Configure:

- Build command: `npm ci && npm run build --workspace=bd`
- Start command: `npm run start --workspace=bd`
- Health check path: `/api/health`

Set these environment variables in the Render service's **Environment** settings:

- `MONGODB_URI`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` — at least 32 characters
- `GMAIL_USER` — the Gmail address that authorized the Gmail API
- `GMAIL_CLIENT_ID` — OAuth client ID from Google Cloud
- `GMAIL_CLIENT_SECRET` — OAuth client secret; keep it backend-only
- `GMAIL_REFRESH_TOKEN` — Gmail API refresh token with the `gmail.send` permission; keep it backend-only
- `TRUST_PROXY=true` — use Render's forwarded client IP for sign-up and login rate limits
- `FRONTEND_ORIGINS` — the exact frontend HTTPS origin, with no trailing slash

Keep backend secrets only in Render, never in the frontend project. Render sets `PORT` for the service automatically. In MongoDB Atlas, allowlist the outbound IP addresses or ranges shown in the Render service settings.

For Gmail API ticket setup, follow [GMAIL-API-SETUP.md](./GMAIL-API-SETUP.md). The sending address is the Gmail account you authorize; the website can continue using its `vercel.app` address.

After both services are deployed, set the Render service URL as the frontend's `NEXT_PUBLIC_API_URL` and the frontend URL as the backend's `FRONTEND_ORIGINS`, then redeploy both. Verify `/api/health`, sign in at `/admin`, save an event change, confirm it appears on the public event page, sign out, and test an event sign-up with Gmail ticket delivery. Admin sessions require HTTPS.

GitHub Actions runs lint and the production build on pushes and pull requests. The build also type-checks the backend.

Useful root scripts:

- `npm run dev` — run both projects.
- `npm run build` — build the frontend and type-check the backend.
- `npm run lint` — lint both projects.
- `npm run typecheck` — type-check both projects.
# MSAI
