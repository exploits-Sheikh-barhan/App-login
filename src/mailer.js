const nodemailer = require('nodemailer');

const hasSmtp = Boolean(process.env.SMTP_HOST);

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

function buildContent(code, purpose) {
  const title = purpose === 'signup' ? 'Verifikasi email kamu' : 'Kode login kamu';
  const text =
    `${title}\n\n` +
    `Kode OTP: ${code}\n` +
    `Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun.\n\n` +
    `Jika kamu tidak merasa meminta kode ini, abaikan email ini.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="margin:0 0 12px">${title}</h2>
      <p>Gunakan kode berikut untuk melanjutkan:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
      <p style="color:#666;font-size:13px">Kode berlaku 10 menit. Jangan bagikan kode ini ke siapa pun.</p>
    </div>`;
  return { subject: title, text, html };
}

async function sendOtpEmail(to, code, purpose) {
  if (!transporter) {
    // Di production, OTP tidak boleh bocor ke log
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP belum dikonfigurasi di production');
    }
    console.log(`[DEV] OTP untuk ${to} (${purpose}): ${code}`);
    return;
  }

  const { subject, text, html } = buildContent(code, purpose);
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendOtpEmail };
