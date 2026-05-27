import crypto from 'crypto';

const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_FILE = 'scores.json';

// Required: SIGN_SECRET (preferred) or falls back to GITHUB_TOKEN (already required for gist storage).
// No plaintext default — refusing to run is safer than silently using a known secret.
const SIGN_SECRET = process.env.SIGN_SECRET || process.env.GITHUB_TOKEN;
if (!SIGN_SECRET) throw new Error('SIGN_SECRET or GITHUB_TOKEN must be set');

const SCORE_CAP        = 50;              // hard max — current top is 39, 50 gives headroom
const MIN_AGE_MS       = 1000;
const MAX_AGE_MS       = 30 * 60 * 1000;
const MS_PER_POINT     = 800;             // tightened: 0.8s real time per point
const IP_COOLDOWN_MS   = 8 * 1000;
const NAME_COOLDOWN_MS = 30 * 1000;       // same name can't submit twice within 30s

const POW_DIFFICULTY      = 4;
const TELE_MIN_FIRST_MS   = 1500;         // tightened: first pipe realistically takes ~2s
const TELE_MIN_GAP_MS     = 500;          // tightened: 0.5s between pipe clears
const TELE_MIN_PER_POINT  = 800;          // matches MS_PER_POINT

const headers = () => ({
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json'
});

async function readScores() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: headers() });
  const gist = await res.json();
  return JSON.parse(gist.files[GIST_FILE].content || '[]');
}

async function writeScores(scores) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(scores) } } })
  });
}

function sydneyDateString(isoString) {
  const d = new Date(isoString || Date.now());
  return d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-');
}

function todaySydney() {
  return sydneyDateString(new Date().toISOString());
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;   // required — set in Vercel env vars

/* ── Anti-tamper helpers ─────────────────────────── */
function signChallenge(ts, challenge) {
  return crypto.createHmac('sha256', SIGN_SECRET)
    .update(`${ts}:${challenge}`)
    .digest('base64url');
}

function verifyToken(token) {
  if (typeof token !== 'string') return { ok: false, reason: 'missing token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [tsStr, challenge, sig] = parts;
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad ts' };
  if (!/^[0-9a-f]+$/.test(challenge)) return { ok: false, reason: 'bad challenge' };
  const expected = signChallenge(ts, challenge);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad signature' };
  }
  const age = Date.now() - ts;
  if (age < 0)           return { ok: false, reason: 'future token' };
  if (age < MIN_AGE_MS)  return { ok: false, reason: 'too fast' };
  if (age > MAX_AGE_MS)  return { ok: false, reason: 'token expired' };
  return { ok: true, age, ts, challenge };
}

function verifyPoW(challenge, nonce) {
  if (nonce === undefined || nonce === null) return false;
  const input = challenge + String(nonce);
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.startsWith('0'.repeat(POW_DIFFICULTY));
}

function verifyTelemetry(clears, score) {
  if (!Array.isArray(clears)) return { ok: false, reason: 'missing telemetry' };
  if (clears.length !== score) return { ok: false, reason: 'telemetry count != score' };
  if (score === 0) return { ok: true };

  for (const c of clears) {
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) {
      return { ok: false, reason: 'bad telemetry value' };
    }
  }
  if (clears[0] < TELE_MIN_FIRST_MS) {
    return { ok: false, reason: 'first clear too fast' };
  }
  for (let i = 1; i < clears.length; i++) {
    if (clears[i] - clears[i - 1] < TELE_MIN_GAP_MS) {
      return { ok: false, reason: 'impossible pipe gap' };
    }
  }
  const total = clears[clears.length - 1];
  if (total < score * TELE_MIN_PER_POINT) {
    return { ok: false, reason: 'telemetry too fast overall' };
  }
  return { ok: true };
}

function checkOrigin(req) {
  const origin  = req.headers.origin  || '';
  const referer = req.headers.referer || '';
  const src = `${origin} ${referer}`.toLowerCase();
  return /tappy-yak|localhost|127\.0\.0\.1/.test(src);
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'] || '';
  return xff.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function hashIp(ip) {
  return crypto.createHmac('sha256', SIGN_SECRET).update(ip).digest('hex').slice(0, 12);
}

function sanitize(s) {
  return { name: s.name, score: s.score, createdAt: s.createdAt };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const limit = parseInt(req.query.limit || '15', 10);
      const type  = req.query.type || 'alltime';
      let scores  = await readScores();

      if (type === 'daily') {
        const today = todaySydney();
        scores = scores.filter(s => sydneyDateString(s.createdAt) === today);
      } else if (type === 'last2days') {
        // today + yesterday in Sydney time
        const today = todaySydney();
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        const yesterday = sydneyDateString(d.toISOString());
        scores = scores.filter(s => {
          const dt = sydneyDateString(s.createdAt);
          return dt === today || dt === yesterday;
        });
      }

      const top = scores.sort((a, b) => b.score - a.score).slice(0, limit).map(sanitize);
      return res.status(200).json(top);
    }

    if (req.method === 'POST') {
      const { name, score, token, nonce, clears } = req.body || {};

      // ── Admin direct-insert: bypasses all anti-cheat. Use only via curl with the admin key. ──
      // POST /api/scores?key=<ADMIN_PASSWORD>  body: {name, score, createdAt?}
      const adminKey = req.query?.key;
      if (adminKey && ADMIN_PASSWORD && adminKey === ADMIN_PASSWORD) {
        if (!name || typeof score !== 'number') return res.status(400).json({ error: 'name and numeric score required' });
        const createdAt = req.body?.createdAt || new Date().toISOString();
        const scores = await readScores();
        scores.push({ name: name.trim().slice(0, 20), score, createdAt, _admin: true });
        await writeScores(scores);
        return res.status(200).json({ ok: true, mode: 'admin' });
      }

      // Generic 403 used for all security-relevant failures so an attacker can't
      // tell which specific check failed and iterate on bypasses.
      const REJECT = res => res.status(403).json({ error: 'submission rejected' });

      if (!checkOrigin(req)) return REJECT(res);

      if (!name || typeof name !== 'string') return REJECT(res);
      if (typeof score !== 'number' || !Number.isFinite(score)) return REJECT(res);
      if (score < 0 || score > SCORE_CAP) return REJECT(res);

      const v = verifyToken(token);
      if (!v.ok) return REJECT(res);

      if (!verifyPoW(v.challenge, nonce)) return REJECT(res);

      const minMs = Math.max(MIN_AGE_MS, score * MS_PER_POINT);
      if (v.age < minMs) return REJECT(res);

      const t = verifyTelemetry(clears, score);
      if (!t.ok) return REJECT(res);

      const scores = await readScores();

      // Token single-use (replay protection)
      if (scores.some(s => s.tt === v.ts)) return REJECT(res);

      const ipHash = hashIp(clientIp(req));
      const now = Date.now();
      const cleanName = name.trim().slice(0, 20);
      const nameLower = cleanName.toLowerCase();

      // Per-IP cooldown
      const ipRecent = scores.find(s =>
        s.ipHash === ipHash &&
        (now - new Date(s.createdAt).getTime()) < IP_COOLDOWN_MS
      );
      if (ipRecent) {
        return res.status(429).json({ error: 'slow down — try again in a few seconds' });
      }

      // Per-name cooldown (stops IP-rotation attacks that reuse the same name)
      const nameRecent = scores.find(s =>
        (s.name || '').toLowerCase() === nameLower &&
        (now - new Date(s.createdAt).getTime()) < NAME_COOLDOWN_MS
      );
      if (nameRecent) {
        return res.status(429).json({ error: 'this name submitted recently — wait a moment' });
      }

      scores.push({
        name: cleanName,
        score,
        createdAt: new Date().toISOString(),
        tt: v.ts,
        ipHash
      });
      await writeScores(scores);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { type, key, filter, scope } = req.query;
      if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD env var not set on server' });
      if (key !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });
      let scores = await readScores();
      const beforeCount = scores.length;
      if (type === 'today') {
        const today = todaySydney();
        scores = scores.filter(s => sydneyDateString(s.createdAt) !== today);
      } else if (type === 'alltime') {
        scores = [];
      } else if (type === 'name') {
        const f = (filter || '').toLowerCase().trim();
        if (!f) return res.status(400).json({ error: 'filter required' });
        if (f.length < 2) return res.status(400).json({ error: 'filter must be at least 2 chars (single-letter filters too dangerous)' });
        const today = todaySydney();
        const scopeToday = scope === 'today';
        scores = scores.filter(s => {
          const nameMatch = (s.name || '').toLowerCase().includes(f);
          if (!nameMatch) return true;                          // keep non-matches
          if (scopeToday && sydneyDateString(s.createdAt) !== today) return true; // keep non-today matches
          return false;                                          // drop
        });
      } else if (type === 'above') {
        const n = parseInt(filter || '0', 10);
        scores = scores.filter(s => (s.score || 0) <= n);
      } else if (type === 'iphash') {
        const f = (filter || '').trim();
        if (!f) return res.status(400).json({ error: 'filter required' });
        scores = scores.filter(s => s.ipHash !== f);
      } else {
        return res.status(400).json({ error: 'type must be today, alltime, name, above, or iphash' });
      }
      await writeScores(scores);
      return res.status(200).json({ ok: true, removed: beforeCount - scores.length, remaining: scores.length });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
