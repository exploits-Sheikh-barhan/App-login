const crypto = require('crypto');
const { query } = require('./db');
const { sendOtpEmail } = require('./mailer');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(email, purpose, code) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  return crypto.createHmac('sha256', secret).update(`${email}:${purpose}:${code}`).digest('hex');
}

async function issueOtp(email, purpose) {
  const last = await query(
    'SELECT created_at FROM otps WHERE email = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1',
    [email, purpose]
  );
  if (last.rows.length) {
    const elapsed = Date.now() - new Date(last.rows[0].created_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) return; // cooldown: jangan spam email
  }

  // Batalkan OTP lama yang masih aktif
  await query(
    'UPDATE otps SET expires_at = NOW() WHERE email = $1 AND purpose = $2 AND expires_at > NOW()',
    [email, purpose]
  );

  const code = generateCode();
  await query(
    'INSERT INTO otps (email, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [email, purpose, hashCode(email, purpose, code), new Date(Date.now() + OTP_TTL_MS)]
  );

  await sendOtpEmail(email, code, purpose);
}

async function verifyOtp(email, purpose, code) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts FROM otps
     WHERE email = $1 AND purpose = $2 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, purpose]
  );
  if (!rows.length) return false;

  const otp = rows[0];
  if (otp.attempts >= MAX_ATTEMPTS) return false;

  await query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);

  const expected = Buffer.from(hashCode(email, purpose, code));
  const stored = Buffer.from(otp.code_hash);
  const valid = expected.length === stored.length && crypto.timingSafeEqual(expected, stored);

  if (valid) {
    // Sekali pakai
    await query('UPDATE otps SET expires_at = NOW() WHERE id = $1', [otp.id]);
  }
  return valid;
}

module.exports = { issueOtp, verifyOtp };
