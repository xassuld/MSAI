# MSAI Website

The site is split into two workspace projects:

- `fd/` — Next.js frontend.
- `bd/` — Node.js/Express backend, MongoDB, admin sessions, and Cloudinary upload signing.

## Local development

1. Keep backend credentials in `bd/.env.local`. Start from `bd/.env.example` if setting up a new machine. The backend also loads `bd/.env` as a fallback. Do not copy backend secrets into the frontend.
2. Set `ADMIN_PASSWORD` and an `ADMIN_SESSION_SECRET` with at least 32 characters in `bd/.env.local`.
3. Keep `NEXT_PUBLIC_API_URL=http://localhost:4000` in `fd/.env.local`.
4. From the repository root, run `npm install` once, then `npm run dev`.
5. Open the frontend URL printed by Next.js and visit `/admin` to edit the event.

The backend defaults to port `4000` and allows the local frontend origins on ports `3000` and `3001`. If Next.js chooses another port, add that origin to `FRONTEND_ORIGINS` in `bd/.env.local`.

## Production

Deploy the frontend and backend as separate Vercel projects from the same GitHub repository:

### Frontend project

Set the project root to `fd/` and use the Next.js preset. Set `NEXT_PUBLIC_API_URL` to the backend project's public HTTPS URL in the Vercel **Production** environment. This variable is embedded at build time, so redeploy after changing it.

### Backend project

Import the same repository as another Vercel project and set the project root to `bd/`. Vercel detects the Express app. Set these environment variables in the backend project's Vercel settings:

- `MONGODB_URI`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` — at least 32 characters
- `FRONTEND_ORIGINS` — the exact frontend HTTPS origin, with no trailing slash

Keep backend secrets only in the backend project, never in the frontend project. Vercel sets `NODE_ENV` for production automatically.

Vercel functions use dynamic outbound IPs by default. To keep MongoDB Atlas IP access restricted, use Vercel Static IPs (Pro or Enterprise) and allowlist those addresses. Otherwise, Atlas requires a broad `0.0.0.0/0` rule for Vercel access; avoid this if you need network-level IP restrictions.

After both projects are deployed, set each project's URL in the other's environment variable (`NEXT_PUBLIC_API_URL` on the frontend and `FRONTEND_ORIGINS` on the backend), then redeploy both. Verify `/api/health`, sign in at `/admin`, save an event change, confirm it appears on the public event page, and sign out. Admin sessions require HTTPS.

GitHub Actions runs lint and the production build on pushes and pull requests. The build also type-checks the backend.

Useful root scripts:

- `npm run dev` — run both projects.
- `npm run build` — build the frontend and type-check the backend.
- `npm run lint` — lint both projects.
- `npm run typecheck` — type-check both projects.
# MSAI
