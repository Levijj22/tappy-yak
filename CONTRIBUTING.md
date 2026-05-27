# Contributing to TappyYak

Thanks for wanting to help make a yak flap better. 🦬

## How to send a change

1. **Fork** the repo on GitHub
2. **Clone** your fork locally
3. **Create a branch** off `main`:
   ```bash
   git checkout -b feat/short-description
   ```
   Branch name conventions:
   - `feat/…` for features
   - `fix/…` for bug fixes
   - `chore/…` for tooling / refactors
   - `docs/…` for documentation only

4. **Make your change.** Keep it focused — one logical change per PR.

5. **Test locally:**
   ```bash
   vercel dev
   ```
   Make sure the game still starts, you can play a round, and the leaderboard loads. If you touched `api/`, hit the endpoints with `curl` and verify they behave.

6. **Commit** with a short, imperative message:
   ```
   Add swipe-to-flap on touch devices
   ```
   Not "Added stuff" or "fixes".

7. **Push** to your fork and open a **Pull Request** against `main`. In the PR description:
   - What does this change?
   - Why?
   - How did you test it?
   - Screenshot/video if it's a visual change

8. A Vercel preview will be deployed automatically on every PR — use the preview URL to verify the live result before requesting review.

## Code style

- **2-space indent**, semicolons, single quotes (match what's already in the file).
- **Vanilla JS only.** No frameworks, no transpilers. `index.html` is intentionally a single file that runs straight in the browser.
- **No new dependencies** in `api/` functions without good reason. They are intentionally zero-dep so cold starts stay fast.
- **Don't commit secrets.** The `.gitignore` blocks `.env*` and `.vercel/`, but double-check before you push.

## Anti-cheat changes

If you're touching anything in `api/scores.js` related to score validation (`verifyToken`, `verifyPoW`, `verifyTelemetry`, IP/name cooldowns, etc.):

- Explain **what attack** your change is defending against.
- Explain **what the cost is for legit players** (false-reject rate, perceived latency, etc.).
- Add or update the rule list in the README.
- Be aware: if you loosen a check, an attacker may already have a script targeting it.

## What I'm likely to merge

- 🎨 New yak skins, themes, palette tweaks
- 🎵 Sound effects (currently silent)
- 📱 Better touch controls (e.g. swipe to flap)
- 🌍 i18n / translations
- 🧪 Tests for the anti-cheat helpers
- 🐛 Bug fixes with a clear repro
- ⚡ Performance improvements with a measurement

## What I'm less likely to merge

- Framework rewrites (React/Vue/etc.) — the no-build, single-file constraint is intentional
- Big new features without discussing in an issue first
- Cosmetic-only refactors of working code
- Anything that adds tracking, analytics, or remote logging

When in doubt, **open an issue first** and ask before sinking a lot of time into a big PR.

## Questions?

Open an issue with the `question` label. Be patient — this is a hobby project, replies come when they come.
