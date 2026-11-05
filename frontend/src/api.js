const API_ROOT = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.detail || 'הבקשה נכשלה. נסו שוב.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  register: (data) => request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  login: (data) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  listContent: (token) => request('/api/content', { token }),
  getContent: (token, id) => request(`/api/content/${encodeURIComponent(id)}`, { token }),
  createContent: (token, data) => request('/api/content', {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteContent: (token, id) => request(`/api/content/${encodeURIComponent(id)}`, {
    token,
    method: 'DELETE',
  }),
  saveAttentionScore: (token, id, score) => request(
    `/api/content/${encodeURIComponent(id)}/attention`,
    { token, method: 'POST', body: JSON.stringify({ score }) },
  ),
  startSession: (token, contentId) => request('/api/sessions', {
    token,
    method: 'POST',
    body: JSON.stringify({ content_id: contentId }),
  }),
  addReading: (token, sessionId, payload) => request(`/api/sessions/${encodeURIComponent(sessionId)}/readings`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  endSession: (token, sessionId) => request(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
    token,
    method: 'POST',
  }),
  getSessions: (token) => request('/api/sessions', { token }),
  getSession: (token, sessionId) => request(`/api/sessions/${encodeURIComponent(sessionId)}`, { token }),
};