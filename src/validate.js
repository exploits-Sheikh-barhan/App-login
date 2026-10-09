const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function isValidPassword(password) {
  // bcrypt hanya memproses 72 byte pertama, jadi batas atas dikunci di 72
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

function isValidOtp(code) {
  return /^\d{6}$/.test(code);
}

module.exports = { normalizeEmail, isValidEmail, isValidPassword, isValidOtp };
