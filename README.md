# Pinboard

A private journal for thoughts and trades — asset, category, mood, and notes,
with clipboard-paste screenshot support. Built with Next.js, Neon Postgres
(via Vercel's marketplace integration), and Vercel Blob for images.

## Deploying

See the setup walkthrough in chat, or the short version below:

1. Push this folder to a new GitHub repo.
2. Import that repo as a new project in Vercel.
3. In the project's **Storage** tab, add **Neon** (Postgres) and **Blob**.
   Vercel wires up the env vars automatically — you don't need to copy
   any connection strings by hand.
4. Deploy. The `entries` table is created automatically the first time
   the app talks to the database, so there's no separate migration step.

## Local development

```bash
npm install
npx vercel env pull .env.local   # pulls DATABASE_URL and BLOB_READ_WRITE_TOKEN
npm run dev
```
