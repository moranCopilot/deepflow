# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

For product/architecture context, see:
- [Product Introduction](docs/product/introduction.md)
- [Project Overview](.claude/PROJECT_OVERVIEW.md)

## Common commands

### Install dependencies
- Frontend + Vercel functions (repo root):
  - `npm install`
- Standalone server (optional; separate package):
  - `cd server && npm install`

### Run the frontend (Vite)
- Dev server (HMR): `npm run dev`
- Production build: `npm run build`
- Preview the production build locally: `npm run preview`
- Lint: `npm run lint`
- Typecheck only (no Vite build): `npx tsc -b`
- Lint a single file: `npx eslint src/path/to/file.tsx`

### Run Vercel serverless functions locally
This repo uses `api/*.ts` as Vercel Serverless Functions.
- Local dev (requires Vercel CLI): `vercel dev`

### Run the standalone Node server (Express)
The `server/` directory is a separate Node/TS service (long-lived process; not serverless).
- Dev (nodemon + ts-node/esm): `cd server && npm run dev`
- Build: `cd server && npm run build`
- Start built server: `cd server && npm start`

### Asset tooling
- Optimize background videos (requires `ffmpeg`): `npm run optimize-videos`

### Tests
There is currently no test runner configured in `package.json` (no `test` script). If you add one, update this file with:
- the full test command
- how to run a single test

## Architecture overview (big picture)

### Two backend modes
This project supports two ways to serve backend capabilities:
1. **Vercel deployment (recommended)**
   - Static frontend build output: `dist/`
   - Serverless endpoints: `api/*.ts` (see `vercel.json`)
2. **Standalone server (`server/`)**
   - Express server for environments where you want a long-lived process (e.g., local dev without serverless constraints).

Frontend API base URL logic lives in `src/utils/api-config.ts`:
- Dev defaults to `http://localhost:3000`
- Prod defaults to same-origin (`''`)

### Frontend (React/Vite)
- Entry point: `src/main.tsx` → `src/App.tsx`.
- `src/App.tsx` is the top-level “hardware simulator” composition:
  - Renders the phone UI (`SupplyDepotApp`) plus simulated devices (headset/printer/glasses) and scene background.
  - Owns environment scene cycling and routes printed content / knowledge cards to the printer UI.
- `src/components/SupplyDepotApp.tsx` is the main “phone app” and most business logic:
  - Ingests inputs (files, captured images, voice memos).
  - Creates/updates `FlowItem`s (generated learning items) and manages playback.
  - Calls server APIs for:
    - analysis/content generation (`/api/analyze`)
    - text-to-speech (`/api/tts`)
    - live practice sessions (`/api/live-session`)
  - Uses HLS for audio playback (`hls.js`).
- Scene/slot system:
  - Definitions are in `src/config/scene-config.tsx` (`SCENE_CONFIGS`, `SLOT_DEFINITIONS`).
  - Slots are used to classify/assign generated content to “time-of-day” buckets and drive which scenes can be activated.
- Live practice (client side):
  - `src/hooks/useLiveSession.ts` connects to `/api/live-session` using:
    - `POST` to init
    - `EventSource` (SSE) to receive audio + events
    - `POST` to send mic audio chunks
- Caching:
  - `src/utils/cache-manager.ts` implements a 3-layer cache:
    - IndexedDB for files/audio blobs
    - localStorage for FlowItem metadata
    - 30-day expiry/cleanup
  - Cache keys are derived from file/script hashes (see `src/utils/file-utils.ts`).

### Vercel Serverless Functions (`api/`)
These are the deployed backend endpoints when running on Vercel.
- `api/analyze.ts`
  - Parses multipart uploads, uploads to Google AI File Manager, runs Gemini generation, returns JSON used to build `FlowItem`s.
  - Prompt selection is delegated to `api/prompts/*`.
- `api/prompts/*`
  - `api/prompts/index.ts` chooses templates (e.g. `quick_summary`, `deep_analysis`, `interactive_practice`).
- `api/tts.ts`
  - Stateless TTS endpoint designed for serverless.
  - Tries ListenHub if configured (via env), otherwise falls back to Google TTS.
  - `GET /api/tts?taskId=...` polls ListenHub episode status when applicable.
- `api/live-session.ts`
  - Implements live practice over **HTTP + SSE**, while internally bridging to Gemini Live over WebSocket.
  - Maintains in-memory session state (best-effort on serverless; see `WEBSOCKET_DEPLOYMENT.md` for constraints).
  - Emits events like `audio`, `transcription`, and `knowledgeCard`.
- Other endpoints (also in `api/`):
  - `health.ts`, `proxy-audio.ts`, `review.ts`, `summarize-conversation.ts`.
- Serverless env var resolution:
  - `api/config-helper.ts` centralizes env lookup (supports multiple key names for compatibility).

### Standalone server (`server/`)
- `server/index.ts` is the Express entrypoint.
  - Provides equivalents of several `/api/*` routes for local/long-lived operation.
  - Supports proxy configuration via `HTTP_PROXY` / `HTTPS_PROXY`.
- `server/config.ts` loads `.env`/`.env.local` and exposes `config`.

### Deployment / ops docs
When changing deployment behavior, consult these docs:
- [Deployment Overview](docs/deployment/overview.md) (frontend API base URL + backend env vars)
- [Vercel Deployment](docs/deployment/vercel.md) (Vercel-specific configuration + constraints)
- [WebSocket Deployment](docs/deployment/websocket.md) (live session over HTTP+SSE on Vercel)
- [Troubleshooting](docs/troubleshooting/vercel.md) and [Network Troubleshooting](docs/troubleshooting/network.md)

## Assistant/project rules to follow

### From `.claude/CLAUDE.md`
- Tone convention: each interaction starts with “哥”.
- Prefer eliminating branching via structure over piling on conditionals; if logic exceeds ~3 major branches or gets deeply nested, refactor.
- Documentation convention (GEB-style): keep “map == terrain”; higher-level architecture docs should be kept in sync with code changes (this repo uses `.claude/*` for that).