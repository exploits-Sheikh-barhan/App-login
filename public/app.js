const state = { email: '', purpose: 'signup' };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showStep(id) {
  $$('.step').forEach((el) => (el.hidden = el.id !== id));
  setMsg('');
}

function setMsg(text, type = 'error') {
  const el = $('#msg');
  el.textContent = text;
  el.className = `msg ${type}`;
}

function setEmailLabels(email) {
  $$('[data-email]').forEach((el) => (el.textContent = email));
}

async function api(path, body, method = 'POST') {
  const res = await fetch(`/api/auth${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Terjadi kesalahan, coba lagi.');
    err.data = data;
    throw err;
  }
  return data;
}

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    setMsg(err.message, 'error');
  }
}

function startOtp(purpose) {
  state.purpose = purpose;
  setEmailLabels(state.email);
  showStep('step-otp');
}

function showDashboard(user) {
  state.email = user.email;
  setEmailLabels(user.email);
  $('#brand').textContent = 'Selamat datang';
  showStep('step-dashboard');
}

function showLanding() {
  $('#brand').textContent = 'Masuk atau daftar';
  showStep('step-email');
}

// 1. Cek email → login atau signup
$('#form-email').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get('email').trim().toLowerCase();
  run(async () => {
    state.email = email;
    const { exists } = await api('/check-email', { email });
    setEmailLabels(email);
    showStep(exists ? 'step-login' : 'step-signup');
  });
});

// 2a. Login dengan password
$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  const password = new FormData(e.target).get('password');
  run(async () => {
    try {
      const { user } = await api('/login', { email: state.email, password });
      showDashboard(user);
    } catch (err) {
      if (err.data && err.data.needsVerification) {
        await api('/resend-otp', { email: state.email, purpose: 'signup' });
        startOtp('signup');
        setMsg(err.message, 'info');
      } else {
        throw err;
      }
    }
  });
});

// 2b. Login tanpa password (OTP)
$('#btn-login-otp').addEventListener('click', () => {
  run(async () => {
    await api('/resend-otp', { email: state.email, purpose: 'login' });
    startOtp('login');
    setMsg('Kode OTP sudah dikirim ke email kamu.', 'info');
  });
});

// 3. Signup
$('#form-signup').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const password = fd.get('password');
  if (password !== fd.get('confirm')) {
    setMsg('Password dan konfirmasi tidak sama.');
    return;
  }
  run(async () => {
    await api('/signup', { email: state.email, password });
    startOtp('signup');
    setMsg('Kode OTP sudah dikirim ke email kamu.', 'info');
  });
});

// 4. Verifikasi OTP
$('#form-otp').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = new FormData(e.target).get('code').trim();
  run(async () => {
    const { user } = await api('/verify-otp', {
      email: state.email,
      code,
      purpose: state.purpose,
    });
    showDashboard(user);
  });
});

$('#btn-resend').addEventListener('click', () => {
  run(async () => {
    await api('/resend-otp', { email: state.email, purpose: state.purpose });
    setMsg('Jika email terdaftar, kode baru sudah dikirim.', 'info');
  });
});

// Tombol kembali
$$('[data-back]').forEach((btn) => btn.addEventListener('click', showLanding));

// Logout
$('#btn-logout').addEventListener('click', () => {
  run(async () => {
    await api('/logout');
    state.email = '';
    showLanding();
  });
});

// Cek sesi saat halaman dibuka
(async () => {
  try {
    const { user } = await api('/me', null, 'GET');
    showDashboard(user);
  } catch {
    showLanding();
  }
})();
