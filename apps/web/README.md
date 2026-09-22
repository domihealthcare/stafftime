# Web app

React + Vite + Tailwind. Three screens: **Clock**, **Timesheet**, **Schedule**.

Run it from the repository root with `npm run dev` (starts the API too), or
`npm run dev:web` on its own, then open http://localhost:5173.

The dev server proxies `/api` to the NestJS server on port 3000, so there is no
CORS setup in development. See `docs/architecture.md` for how the screens are
put together and what still needs doing before deployment.
