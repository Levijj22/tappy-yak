import crypto from 'crypto';

const SIGN_SECRET = process.env.SIGN_SECRET || process.env.GITHUB_TOKEN;
if (!SIGN_SECRET) throw new Error('SIGN_SECRET or GITHUB_TOKEN must be set');

// Proof-of-work difficulty: N leading hex zeros in sha256(challenge + nonce).
// 4 hex zeros = 16 bits ≈ 65k avg hashes. Pure-JS solver ≈ 0.7s avg, ~3s worst-case.
const POW_DIFFICULTY = 4;

function signChallenge(ts, challenge) {
  return crypto.createHmac('sha256', SIGN_SECRET)
    .update(`${ts}:${challenge}`)
    .digest('base64url');
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ts = Date.now();
  const challenge = crypto.randomBytes(8).toString('hex'); // 16 hex chars
  const sig = signChallenge(ts, challenge);
  const token = `${ts}.${challenge}.${sig}`;
  res.status(200).json({ token, difficulty: POW_DIFFICULTY });
}
