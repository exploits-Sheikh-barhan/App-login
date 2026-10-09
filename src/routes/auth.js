const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { issueOtp, verifyOtp } = require('../otp');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../session');
const { normalizeEmail, isValidEmail, isValidPassword, isValidOtp } = require('../validate');

const router = express.Router();

// Hash palsu supaya waktu respon sama, baik email ada maupun tidak
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
  })
);

const badEmail = (res) => res.status(400).json({ error: 'Format email tidak valid.' });

// Frontend pakai ini untuk memutuskan: tampilkan login atau signup
router.post('/check-email', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return badEmail(res);

    const { rows } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    next(err);
  }
});

// Daftar: buat akun (belum verified) lalu kirim OTP
router.post('/signup', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!isValidEmail(email)) return badEmail(res);
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password minimal 8 karakter, maksimal 72.' });
    }

    const { rows } = await query('SELECT email_verified FROM users WHERE email = $1', [email]);
    if (rows.length && rows[0].email_verified) {
      return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan login.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    if (rows.length) {
      // Akun belum verified: izinkan ulang signup dengan password baru
      await query('UPDATE users SET password_hash = $2 WHERE email = $1', [email, passwordHash]);
    } else {
      await query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, passwordHash]);
    }

    await issueOtp(email, 'signup');
    res.status(201).json({ message: 'Kode OTP sudah dikirim ke email kamu.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan login.' });
    }
    next(err);
  }
});

// Login dengan password
router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!isValidEmail(email)) return badEmail(res);

    const { rows } = await query(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !match) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Email belum diverifikasi. Kami kirim ulang kode OTP.',
        needsVerification: true,
      });
    }

    setSessionCookie(res, user);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// Kirim OTP.
// purpose "signup" → untuk akun yang belum verified
// purpose "login"  → untuk akun yang sudah verified (login tanpa password)
// Respon selalu sama supaya tidak membocorkan apakah email terdaftar.
router.post('/resend-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';
    if (!isValidEmail(email)) return badEmail(res);

    const { rows } = await query('SELECT email_verified FROM users WHERE email = $1', [email]);
    const eligible =
      rows.length > 0 &&
      (purpose === 'login' ? rows[0].email_verified : !rows[0].email_verified);

    if (eligible) await issueOtp(email, purpose);

    res.json({ message: 'Jika email terdaftar, kode OTP sudah dikirim.' });
  } catch (err) {
    next(err);
  }
});

// Verifikasi OTP → untuk signup (mengaktifkan akun) atau login (tanpa password)
router.post('/verify-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';

    if (!isValidEmail(email)) return badEmail(res);
    if (!isValidOtp(code)) return res.status(400).json({ error: 'Kode OTP harus 6 digit.' });

    const ok = await verifyOtp(email, purpose, code);
    if (!ok) {
      return res
        .status(401)
        .json({ error: 'Kode OTP salah, sudah kadaluarsa, atau terlalu banyak percobaan.' });
    }

    const { rows } =
      purpose === 'signup'
        ? await query('UPDATE users SET email_verified = TRUE WHERE email = $1 RETURNING id, email', [email])
        : await query('SELECT id, email FROM users WHERE email = $1 AND email_verified = TRUE', [email]);

    if (!rows.length) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

    setSessionCookie(res, rows[0]);
    res.json({ user: { id: rows[0].id, email: rows[0].email } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
