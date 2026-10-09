# Email Auth App

Signup & login dengan email, mendukung dua cara login:

- **Email belum terdaftar** → Signup (buat password) → verifikasi kode OTP 6 digit → akun aktif
- **Email sudah terdaftar** → pilih **login dengan password** atau **login dengan kode OTP**

Stack: Node.js, Express, PostgreSQL, bcrypt, JWT (httpOnly cookie), Nodemailer.

## Fitur keamanan

- Password di-hash dengan bcrypt (cost 12)
- OTP di-hash dengan HMAC-SHA256, berlaku 10 menit, sekali pakai, maksimal 5 percobaan
- Cooldown 60 detik untuk kirim ulang OTP
- Rate limiting pada semua endpoint `/api/auth`
- Session JWT di httpOnly + SameSite=Lax cookie
- Waktu respon login sama baik email ada maupun tidak (anti user enumeration pada login)
- Helmet-style header dasar (`x-powered-by` dimatikan)

## Struktur

```
email-auth-app/
├── public/
│   ├── index.html      # UI multi-step
│   ├── app.js          # logic frontend
│   └── style.css       # tema light & dark
├── src/
│   ├── server.js       # entry point Express
│   ├── db.js           # koneksi PostgreSQL + migrasi tabel
│   ├── otp.js          # generate, hash, kirim, verifikasi OTP
│   ├── mailer.js       # pengiriman email via SMTP
│   ├── session.js      # JWT cookie + middleware auth
│   ├── validate.js     # validasi email & password
│   └── routes/
│       └── auth.js     # semua endpoint /api/auth
├── .env.example
├── railway.json
└── package.json
```

## Endpoint API

| Method | Path | Body | Keterangan |
|---|---|---|---|
| POST | `/api/auth/check-email` | `{ email }` | Mengembalikan `{ exists }` |
| POST | `/api/auth/signup` | `{ email, password }` | Buat akun + kirim OTP signup |
| POST | `/api/auth/login` | `{ email, password }` | Login password |
| POST | `/api/auth/resend-otp` | `{ email, purpose }` | `purpose`: `signup` atau `login` |
| POST | `/api/auth/verify-otp` | `{ email, code, purpose }` | Set session cookie jika valid |
| GET | `/api/auth/me` | — | Data user yang sedang login |
| POST | `/api/auth/logout` | — | Hapus cookie session |
| GET | `/health` | — | Health check untuk Railway |

## Jalankan lokal

Butuh Node.js 18+ dan PostgreSQL.

```bash
npm install
cp .env.example .env     # isi DATABASE_URL dan JWT_SECRET
npm run dev
```

Buka `http://localhost:3000`.

Kalau `SMTP_HOST` belum diisi (mode development), kode OTP akan dicetak di terminal:

```
[DEV] OTP untuk nama@email.com (signup): 483920
```

## Setup GitHub

```bash
git init
git add .
git commit -m "feat: email signup & login dengan password dan OTP"
git branch -M main
git remote add origin https://github.com/USERNAME/email-auth-app.git
git push -u origin main
```

## Deploy ke Railway

1. Buka [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → pilih repo ini.
2. Di project yang sama, klik **+ New** → **Database** → **Add PostgreSQL**.
3. Buka service aplikasi → tab **Variables**, tambahkan:

| Variable | Nilai |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference ke service Postgres) |
| `DATABASE_SSL` | `false` (karena memakai URL internal Railway) |
| `JWT_SECRET` | string acak panjang, misal hasil `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `SMTP_HOST` | host SMTP kamu, misal `smtp.resend.com` atau `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | username SMTP |
| `SMTP_PASS` | password / API key SMTP |
| `MAIL_FROM` | `"Nama App <no-reply@domainkamu.com>"` |

4. Tab **Settings** → **Networking** → **Generate Domain** untuk mendapat URL publik.
5. Setiap `git push` ke `main` akan otomatis men-deploy ulang.

### Catatan SMTP

- Gmail: aktifkan 2-Step Verification, buat **App Password**, lalu pakai sebagai `SMTP_PASS`.
- Untuk production yang serius, pakai layanan transactional email (Resend, Brevo, Postmark, SES) dan verifikasi domain pengirim (SPF & DKIM) supaya email OTP tidak masuk spam.

## Catatan

- Endpoint `check-email` memang memberi tahu apakah email terdaftar, karena itu dibutuhkan untuk memisahkan alur login dan signup. Kalau nanti perlu lebih ketat, alur bisa diubah jadi satu form email + password yang tidak membedakan kasus.
- Akun yang belum diverifikasi tidak bisa login dengan password, dan OTP signup dikirim ulang otomatis.
