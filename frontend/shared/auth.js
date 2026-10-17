(function () {
  const key = 'evalsync.session';
  const customBase = window.EVALSYNC_API_BASE || (window.__ENV__ && window.__ENV__.API_BASE);
  const isLocalDev3000 = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000';
  const API_BASE = customBase || (isLocalDev3000 ? 'http://localhost:5000/api' : '/api');

  async function login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    const sessionData = {
      token: data.token,
      user: data.user
    };

    localStorage.setItem(key, JSON.stringify(sessionData));
    return sessionData;
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      return null;
    }
  }

  function requireRole(role) {
    const current = session();
    if (!current || !current.user || current.user.role !== role) {
      location.href = '../login/index.html';
      return null;
    }
    return current;
  }

  function signOut() {
    localStorage.removeItem(key);
    location.href = '../login/index.html';
  }

  window.EvalSyncAuth = { login, session, requireRole, signOut };
}());
