
(function () {
  const customBase = window.EVALSYNC_API_BASE || (window.__ENV__ && window.__ENV__.API_BASE);
  const isLocalDev3000 = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000';
  const API_BASE = customBase || (isLocalDev3000 ? 'http://localhost:5000/api' : '/api');
  const SESSION_KEY = 'evalsync.session';

  function getToken() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return session ? session.token : null;
    } catch (_) {
      return null;
    }
  }

  async function request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;
    const headers = {
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = (data && data.message) || `Request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  const api = {
    async get(path) {
      return request(path, { method: 'GET' });
    },

    async post(path, data) {
      const isFormData = data instanceof FormData;
      return request(path, {
        method: 'POST',
        body: isFormData ? data : JSON.stringify(data)
      });
    },

    async patch(path, data) {
      return request(path, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    async delete(path) {
      return request(path, { method: 'DELETE' });
    }
  };

  window.EvalSyncAPI = api;
}());
