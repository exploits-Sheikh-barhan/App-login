const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'session';
const SESSION_TTL = '7d';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === 'production';

function getSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET belum diset');
  return process.env.JWT_SECRET;
}

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: String(user.id), email: user.email }, getSecret(), {
    expiresIn: SESSION_TTL,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProd, sameSite: 'lax' });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Belum login.' });

  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' });
  }
}

module.exports = { setSessionCookie, clearSessionCookie, requireAuth };
