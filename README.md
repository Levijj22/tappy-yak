# 🦬 TappyYak

A Flappy-Bird-style game starring a yak — built for parties, with a daily leaderboard, event-mode timer, and serious anti-cheat on the score submission API.

**Play it live:** [tappy-yak.vercel.app](https://tappy-yak.vercel.app)

---

## Features

- Single-file HTML5 Canvas game (no build step, no framework)
- Daily / 2-day / all-time leaderboards
- **Event mode**: one button starts a 15-minute lockout countdown *and* masks the leaderboard (so prize-night standings stay hidden)
- Admin panel at `/admin` for clearing the leaderboard
- Score submission API with layered anti-cheat:
  - HMAC-signed session tokens
  - Proof-of-work challenge (~1s CPU per submit)
  - Gameplay telemetry validation (pipe-clear timestamps)
  - Token single-use replay protection
  - Per-IP and per-name rate limits
  - Score cap, time-per-point floor, origin check

## Project layout

```
tappy-yak/
├── index.html         # the whole game
├── admin.html         # admin panel (served at /admin via vercel.json rewrite)
├── vercel.json        # /admin → /admin.html rewrite
└── api/
    ├── scores.js      # GET / POST / DELETE scores (Vercel serverless)
    └── session.js     # GET signed session token for anti-cheat
```

Scores are persisted in a **public GitHub Gist** (storing JSON), patched via the GitHub API.

## Running locally

You'll need [Vercel CLI](https://vercel.com/cli):

```bash
npm i -g vercel
vercel dev
```

Then open <http://localhost:3000>.

For the serverless functions to work, set the env vars below (either in a `.env.local` file or via `vercel env pull`).

## Required environment variables

| Name             | Used by                | Purpose |
|------------------|------------------------|---------|
| `GIST_ID`        | `api/scores.js`        | The GitHub Gist that stores the scores JSON |
| `GITHUB_TOKEN`   | `api/scores.js`        | GitHub PAT with `gist` scope — used to read/patch the Gist |
| `SIGN_SECRET`    | `api/scores.js`, `session.js` | HMAC secret for session tokens (falls back to `GITHUB_TOKEN` if unset) |
| `ADMIN_PASSWORD` | `api/scores.js`        | Required — admin DELETE key. Generate with `openssl rand -hex 24` |

The server refuses to start if `SIGN_SECRET`/`GITHUB_TOKEN` are both missing, and returns `500` on admin requests if `ADMIN_PASSWORD` is unset — there is no plaintext fallback shipped in the code.

## Contributing

PRs welcome! Some easy wins on the open-issues list:

- 🎨 New yak skins / themes
- 🎵 Sound effects (currently silent)
- 📱 Better touch controls (swipe to flap?)
- 🌍 i18n
- 🧪 Tests for the anti-cheat verification helpers (`verifyToken`, `verifyPoW`, `verifyTelemetry`)

### Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-thing`
3. Make your change — keep `index.html` self-contained (no build step, please)
4. Test locally with `vercel dev`
5. Open a PR against `main` with a short description of what & why

### Style

- 2-space indent
- Vanilla JS, no frameworks
- No new dependencies in the API functions unless absolutely necessary (current ones are zero-dep)

## License

MIT — see [LICENSE](LICENSE).
