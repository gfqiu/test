# test

A minimal full-stack demo application built with [Next.js](https://nextjs.org) (App Router), TypeScript, and Tailwind CSS. It renders a small **Task Board** whose browser UI talks to a Next.js API route that stores tasks on the server, exercising a real end-to-end flow (browser → API → response).

## Requirements

- Node.js 22+
- npm 10+

## Getting started

Install dependencies and start the dev server:

```bash
npm ci
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) and add/toggle tasks.

## API

The app exposes an in-memory task API at `/api/tasks`:

- `GET /api/tasks` — list tasks
- `POST /api/tasks` — add a task (`{ "title": "..." }`)
- `PATCH /api/tasks` — toggle a task's done state (`{ "id": "..." }`)

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint

## Cloud Agent environment

This repository includes a [`.cursor/environment.json`](.cursor/environment.json) that installs dependencies with `npm ci` and runs the dev server on port 3000 for Cursor Cloud Agents.
