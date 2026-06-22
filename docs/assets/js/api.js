// Ponto único de configuração da URL do backend (Render).
// Pode ser sobrescrito via window.__DISPARADOR_API_BASE_URL__ antes deste script carregar.
// Ajuste o valor abaixo se o Render gerar uma URL diferente da esperada.
const API_BASE_URL = window.__DISPARADOR_API_BASE_URL__ || 'https://disparador-fradema-backend.onrender.com';

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = await res.json();
      message = data.message || message;
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

const api = {
  campaigns: {
    list: (q) => apiRequest(`/campaigns${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id) => apiRequest(`/campaigns/${id}`),
    create: (body) => apiRequest('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => apiRequest(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id) => apiRequest(`/campaigns/${id}`, { method: 'DELETE' }),
    bulkDelete: (ids) => apiRequest('/campaigns/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    removeAll: () => apiRequest('/campaigns/all', { method: 'DELETE' }),
    sync: (id) => apiRequest(`/campaigns/${id}/sync`, { method: 'POST' }),
    dispatch: (id) => apiRequest(`/campaigns/${id}/dispatch`, { method: 'POST' }),
    pause: (id) => apiRequest(`/campaigns/${id}/pause`, { method: 'POST' }),
  },
  templates: {
    list: (whatsAppNumberId) =>
      apiRequest(`/templates${whatsAppNumberId ? `?whatsAppNumberId=${whatsAppNumberId}` : ''}`),
    sync: (whatsAppNumberId) =>
      apiRequest('/templates/sync', { method: 'POST', body: JSON.stringify({ whatsAppNumberId }) }),
  },
  numbers: {
    list: () => apiRequest('/numbers'),
    create: (body) => apiRequest('/numbers', { method: 'POST', body: JSON.stringify(body) }),
    qrcode: (id) => apiRequest(`/numbers/${id}/qrcode`),
    status: (id) => apiRequest(`/numbers/${id}/status`),
    remove: (id) => apiRequest(`/numbers/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    groups: () => apiRequest('/contacts/groups'),
    createGroup: (name, description) =>
      apiRequest('/contacts/groups', { method: 'POST', body: JSON.stringify({ name, description }) }),
    import: (formData) => apiRequest('/contacts/import', { method: 'POST', body: formData }),
  },
};

function showToast(message, type = '') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
