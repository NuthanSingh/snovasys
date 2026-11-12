# Development scripts

Common development and database commands are defined in the root `package.json` so they work consistently from the repository root:

- `npm run dev` starts the API and frontend together.
- `npm run dev:api` starts only the Express API.
- `npm run dev:web` starts only the Vite frontend.
- `npm run db:generate` and `npm run db:migrate` invoke the Prisma workspace; they are ready to use after Stage 3 adds the schema.