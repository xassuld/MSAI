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

Deploy the frontend and backend as separate services:

### Vercel frontend

1. Import the repository as a monorepo project and set the project root to `fd/`. Enable **Include source files outside of the Root Directory in the Build Step** so Vercel can access the root npm workspace and lockfile.
2. Set `NEXT_PUBLIC_API_URL` to the Render backend's public HTTPS URL in the Vercel **Production** environment. This variable is embedded at build time, so redeploy after changing it.
3. Add the final frontend domain to the Vercel project after choosing it.

### Render backend

Create a Node web service from the repository root with:

- Build command: `npm ci && npm run build --workspace=bd`
- Start command: `npm run start --workspace=bd`
- Health check path: `/api/health`

Set these variables in the Render dashboard; keep secrets out of the frontend:

- `NODE_ENV=production`
- `FRONTEND_ORIGINS` — the exact frontend HTTPS origin, with no trailing slash
- `MONGODB_URI`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` — at least 32 characters

Let Render provide `PORT`. In MongoDB Atlas, allow the Render service's outbound IP ranges (shown in its **Connect → Outbound** panel), not just your development computer's IP. Use the narrowest available ranges; Render also offers dedicated outbound IPs.

After both services are deployed, verify `/api/health`, sign in at `/admin`, save an event change, confirm it appears on the public event page, and sign out. Admin sessions require HTTPS.

GitHub Actions runs lint and the production build on pushes and pull requests. The build also type-checks the backend.

Useful root scripts:

- `npm run dev` — run both projects.
- `npm run build` — build the frontend and type-check the backend.
- `npm run lint` — lint both projects.
- `npm run typecheck` — type-check both projects.
