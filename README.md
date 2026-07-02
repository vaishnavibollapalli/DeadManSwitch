# Dead Man's Switch — Digital Legacy Platform

A digital legacy platform: it watches for you to go silent, and when you do, it releases what
you've prepared — encrypted vaults, handoff messages, legal documents — to the people you chose,
through the channels you chose.

Built as a portfolio-grade demonstration of three problems senior engineers deal with constantly:
**unreliable automation** (cron jobs that must never silently fail), **high-stakes security**
(encryption keys that must never live in one place), and **failure-state management** (a system
that must be provably safe to leave alone for weeks at a time).

---

## What's real vs. simulated

This matters more than usual for a project like this, so it's called out explicitly.

| Feature | Status |
|---|---|
| Check-in / trigger state machine (ACTIVE → WARNING → GRACE → TRIGGERED) | **Real** — `workers/triggerEvaluator.js` |
| AES-256-GCM vault encryption | **Real** — `utils/crypto.js` |
| Shamir's Secret Sharing key fragmentation | **Real** (via `shamirs-secret-sharing`) |
| Tamper-evident proof-of-life hash chain | **Real** — `utils/hashChain.js` |
| JWT auth, register/login | **Real** |
| Server-quorum false-positive safeguard | **Real** — `POST /api/heartbeat` lets independent infra nodes self-report; stale (>3min silent) nodes are auto-treated as offline |
| Witness quorum confirmation | **Real** — `POST /api/witness/:conditionId/confirm`, token-gated per recipient |
| Consumer-grade onboarding (9-step wizard) | **Real** — `onboarding_progress` table with a generated `steps_completed` column, `GET/POST /api/onboarding` |
| Email / SMS / Telegram / webhook / IPFS senders | **Real** if you supply API keys (SendGrid, Twilio, Telegram Bot, Pinata); otherwise console-logged simulation, so the pipeline still runs end-to-end |
| AI Digital Executor (handoff message drafting) | **Real** if `ANTHROPIC_API_KEY` is set; otherwise a template-based fallback |
| Beneficiary portal (token-scoped access, download logging, acknowledgment) | **Real** |
| Notarized document signing | **Simulated in the UI.** Wiring a real e-notary vendor (Notarize, DocuSign, Proof) is a config-only extension of the existing `LAWYER_API`/`WEBHOOK` channel adapters — see [Extending it](#extending-it) |
| iOS/Android app with passive location/biometric liveness | **Simulated in the UI.** The backend already models `LOCATION_HEARTBEAT` and `BIOMETRIC` as trigger condition types with a config schema; a real mobile app would just be another authenticated client posting to those endpoints |
| 3D vault visualization, trigger countdown animation | **Real, hand-built** (Canvas 2.5D, no Three.js dependency) |

Nothing here is faked to look more finished than it is — every "simulated" row above is simulated
because it requires either a live third-party account/credential or a native mobile app, both of
which are out of scope for a single backend+frontend demo. The interfaces and data models for all
of it already exist, so plugging in the real thing later is additive, not a rewrite.

---

## Architecture

```
                     ┌─────────────────────┐
                     │   index.html (SPA)   │   Login · Dashboard · Beneficiary
                     │   vanilla JS + CSS   │   Portal · AI Executor
                     └──────────┬───────────┘
                                │ fetch (JWT bearer)
                     ┌──────────▼───────────┐
                     │   Express API         │
                     │   /api/auth           │
                     │   /api/switches/*      │  ← switches, vaults, recipients,
                     │   /api/ai-executor     │    trigger conditions, release channels
                     │   /api/portal (public) │  ← token-scoped, no login required
                     └──────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
    ┌─────────▼────────┐ ┌──────▼───────┐ ┌────────▼────────┐
    │ PostgreSQL         │ │ Trigger worker │ │ Channel senders  │
    │ (schema.sql +      │ │ (node-cron,    │ │ Email/SMS/       │
    │  002_advanced_     │ │  every 5 min)  │ │ Telegram/Webhook/│
    │  features.sql)     │ │                │ │ IPFS/Lawyer API  │
    └────────────────────┘ └────────────────┘ └──────────────────┘
```

**Why a cron worker instead of per-request checks:** the switch has to fire even if nobody ever
visits the site again. The trigger evaluator is a standing process, not something invoked by user
traffic.

**Why the key never touches disk as a whole:** `createVault` generates a one-time AES-256 key,
encrypts the payload, immediately splits the key into 3 Shamir shards (2-of-3 threshold), and
discards the raw key. Reconstruction requires pulling ≥2 shards back together at read time. See
[Security model](#security-model) for the honest caveat on where those shards currently live.

**Why a separate server-quorum check gates every trigger:** this is the answer to "what happens if
your server goes down for 5 minutes — does it accidentally release everyone's vault?" A single
node's `OFFLINE` status can never fire a release on its own; `hasServerQuorum()` requires a
majority of registered `heartbeat_nodes` to agree first.

---

## Feature set

**Multi-condition triggers** — `CHECKIN_TIMER`, `LOCATION_HEARTBEAT`, `BIOMETRIC`,
`WITNESS_QUORUM`, `SERVER_QUORUM`, combinable per switch via `trigger_mode` (`ALL` / `ANY` /
`QUORUM`).

**Multi-channel release** — `EMAIL`, `SMS`, `TELEGRAM`, `WEBHOOK`, `IPFS`, `LAWYER_API`,
`PORTAL_ONLY`, configured per recipient/vault via `release_channels`.

**Structured vault types** — `GENERAL`, `VIDEO`, `LEGAL`, `CRYPTO`, `SOCIAL`, `AI_HANDOFF`,
`PASSWORDS`, each carrying its own `typed_metadata` JSONB shape.

**AI-powered Digital Executor** — drafts handoff messages from freeform notes, in the person's
voice, attached directly to a vault (`POST /api/ai-executor/draft`).

**Beneficiary portal** — a scoped, expiring, single-purpose token per recipient; no account
required on their end. Every access and download is logged (`download_log`) and can be formally
acknowledged (`delivery_receipt_hash`).

**Cryptographic proof-of-life log** — every check-in, escalation, and trigger event is appended
to a SHA-256 hash chain (`proof_of_life_receipts`) where each entry commits to the previous one —
altering history breaks the chain, the same tamper-evidence property blockchains provide, without
needing one.

**Consumer-grade onboarding** — `onboarding_progress` tracks a 9-step wizard per user with a
generated `steps_completed` column, so the frontend always knows exactly where a new user left
off (`GET /api/onboarding`, `POST /api/onboarding/step`).

---

## Project structure

```
backend/
  config/db.js               Postgres pool
  controllers/                One file per resource (auth, switches, vaults, recipients,
                               trigger conditions, release channels, AI executor, beneficiary portal,
                               onboarding, witness confirmations, heartbeat nodes)
  middleware/
    auth.js                   JWT verification
    errorHandler.js            Central error handler + switch-ownership guard
  routes/                      Express routers, mirroring controllers
  utils/
    crypto.js                  AES-256-GCM + Shamir sharding
    hashChain.js                Proof-of-life hash chain
    jwt.js                      Token sign/verify
    audit.js                    Audit log writes
    senders.js                  Email/SMS/Telegram/Webhook/IPFS/Lawyer-API adapters
  workers/triggerEvaluator.js  The cron job that runs the whole state machine
  schema.sql                    Core tables
  002_advanced_features.sql     Multi-condition triggers, multi-channel release, vault types,
                                 beneficiary portal, proof-of-life receipts
  003_onboarding_and_witness.sql Onboarding wizard, witness confirmations, heartbeat uniqueness
  server.js
  package.json / .env.example

frontend/
  index.html                  Full SPA: login (3D canvas), dashboard (trigger visualization,
                               vaults, conditions, activity log), beneficiary portal, AI executor
```

---

## Running it

### Backend

```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npm run migrate              # runs schema.sql, 002_advanced_features.sql, 003_onboarding_and_witness.sql
npm run dev                  # nodemon, http://localhost:4000
```

Everything else in `.env` (SendGrid, Twilio, Telegram, Pinata, Anthropic) is optional — every
integration falls back to a logged simulation if its credentials are absent, so the full flow
(check-in → escalate → trigger → release → beneficiary portal) is exercisable with just Postgres
running.

### Frontend

`frontend/index.html` is a static file — open it directly, or serve it with anything
(`npx serve frontend`). It talks to the backend at `http://localhost:4000` by default; override by
setting `window.DMS_API_BASE` before the inline script runs (e.g. in a small wrapper HTML file, or
via a `<script>window.DMS_API_BASE = "https://your-api.example.com";</script>` tag before it).

If the backend isn't running, the frontend degrades gracefully into a self-contained demo mode
(login, check-in, and the AI executor chat all fall back to local/simulated behavior) — this is
intentional, so the mockup remains explorable and screenshot-able without any setup.

### End-to-end flow (with the backend running)

Sign up → a default switch (7-day interval, 48h grace) is created automatically → the dashboard
fetches your real vaults, beneficiaries, and audit trail and replaces the demo cards with them →
"Add new vault" and "Add beneficiary" call the real API (lightweight `prompt()`-based forms —
functional, not fancy) → "I'm Alive" hits `POST /api/switches/:id/checkin` and appends a real
proof-of-life receipt → returning users with a saved session skip straight past login. Trigger
conditions and delivery channels are still demo-labeled in the UI; their backend endpoints exist
(`/api/switches/:id/conditions`, `/api/switches/:id/channels`) but aren't wired to a form yet —
a reasonable next slice if you want it.

---

## Security model

- **Encryption:** AES-256-GCM per vault, unique key per vault, never persisted in plaintext or as
  a whole key.
- **Key sharding:** Shamir's Secret Sharing, 3 shares / 2-of-3 threshold, generated at write time.
  **Honest caveat:** in this reference implementation all 3 shares are currently stored in the
  same Postgres database (`vault_keys` table) for simplicity. That defeats the point of sharding
  against a single compromised database — production deployment should distribute shares across
  independent trust domains (e.g. primary DB, a separate backup-region DB, and/or a
  user-held/escrow share), which only requires changing `holder_type` handling in
  `vaultController.js`, not the crypto itself.
- **Auth:** bcrypt-hashed passwords, JWT bearer tokens, rate-limited login/register endpoints.
- **Beneficiary access:** cryptographically random, single-purpose, expiring tokens — no password,
  no account, minimal attack surface on the recipient side.
- **False-positive prevention:** trigger release is gated on (1) grace period fully elapsed, (2)
  server quorum agreeing the infra itself is healthy, and (3) any additional configured
  conditions (witness quorum, etc.) resolving according to the switch's `trigger_mode`. No single
  factor can release a vault alone.
- **Audit trail:** every state-changing action writes to `audit_logs`; every check-in/escalation/
  trigger additionally writes to the tamper-evident `proof_of_life_receipts` hash chain.

---

## Extending it

- **Real notarization:** point a `LAWYER_API` or `WEBHOOK` release channel's `config.endpoint` at
  a vendor like Notarize/DocuSign/Proof — `sendToLawyerApi()` in `utils/senders.js` already POSTs
  a JSON payload with bearer auth, which is what most of these vendors' intake APIs expect.
- **Real mobile liveness:** a `LOCATION_HEARTBEAT` or `BIOMETRIC` trigger condition's `config`
  already defines the schema (`safeZoneLat`, `radiusMeters`, `maxSilenceDays`, etc.) — a native app
  is just another authenticated client periodically hitting a heartbeat endpoint you add alongside
  `checkIn` in `switchController.js`.
- **True key-shard distribution:** deploy a second lightweight Node service on separate
  infrastructure (Fly.io, Railway) whose only job is holding one Shamir shard and returning it to
  authenticated reconstruction requests — mirrors the same "no single point of failure" pattern
  already used for `heartbeat_nodes`.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, hand-built Canvas 2.5D visualizations |
| Backend | Node.js + Express |
| Scheduling | `node-cron` |
| Database | PostgreSQL |
| Encryption | Node `crypto` (AES-256-GCM) + `shamirs-secret-sharing` |
| Auth | JWT + bcrypt |
| AI | Anthropic API (Claude), with template fallback |
| Integrations | SendGrid, Twilio, Telegram Bot API, Pinata (IPFS), generic webhook/lawyer-API adapter |
