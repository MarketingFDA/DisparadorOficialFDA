const STATUS_LABEL = {
  PENDING: 'Pendente',
  QUEUED: 'Na fila',
  SENT: 'Enviado',
  DELIVERED: 'Entregue',
  READ: 'Lido',
  FAILED: 'Erro',
};
const STATUS_BADGE = {
  PENDING: 'badge-draft',
  QUEUED: 'badge-sending',
  SENT: 'badge-sending',
  DELIVERED: 'badge-completed',
  READ: 'badge-completed',
  FAILED: 'badge-failed',
};
const CAMPAIGN_STATUS_LABEL = {
  DRAFT: 'Rascunho',
  QUEUED: 'Na fila',
  SENDING: 'Ativo',
  PAUSED: 'Pausado',
  COMPLETED: 'Finalizado',
  FAILED: 'Erro',
};

const params = new URLSearchParams(window.location.search);
const campaignId = params.get('id');

let currentStatus = '';
let currentPage = 1;
const PAGE_SIZE = 50;
let refreshTimer = null;

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

async function loadCampaignHeader() {
  try {
    const c = await api.campaigns.get(campaignId);
    document.title = `${c.name} — Relatório`;
    document.getElementById('detalhe-nome').textContent = c.name;
    const statusLabel = CAMPAIGN_STATUS_LABEL[c.status] || c.status;
    document.getElementById('detalhe-sub').textContent =
      `${statusLabel} · ${c.sentCount + c.deliveredCount + c.readCount}/${c.totalCount} enviados · ${c.errorCount} erro(s)`;
    scheduleRefresh(c.status === 'SENDING' || c.status === 'QUEUED');
  } catch (err) {
    document.getElementById('detalhe-nome').textContent = 'Campanha não encontrada';
    showToast(err.message, 'error');
  }
}

function scheduleRefresh(isLive) {
  clearTimeout(refreshTimer);
  if (isLive) {
    refreshTimer = setTimeout(loadAll, 8000);
  }
}

async function loadMessages() {
  const tbody = document.getElementById('messages-tbody');
  try {
    const result = await api.campaigns.messages(campaignId, {
      status: currentStatus || undefined,
      page: currentPage,
      pageSize: PAGE_SIZE,
    });
    renderMessages(result);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro ao carregar: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderMessages(result) {
  const tbody = document.getElementById('messages-tbody');
  if (result.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum registro encontrado.</td></tr>';
  } else {
    tbody.innerHTML = result.rows
      .map((m) => {
        const label = STATUS_LABEL[m.status] || m.status;
        const badge = STATUS_BADGE[m.status] || 'badge-draft';
        return `
        <tr>
          <td>${escapeHtml(m.contact?.name || '—')}</td>
          <td>${escapeHtml(m.contact?.phone || '—')}</td>
          <td><span class="badge ${badge}">${escapeHtml(label)}</span></td>
          <td>${formatDateTime(m.updatedAt)}</td>
          <td>${escapeHtml(m.errorMessage || '—')}</td>
        </tr>`;
      })
      .join('');
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  document.getElementById('pagination-info').textContent = `Página ${result.page} de ${totalPages} · ${result.total} registro(s)`;
  document.getElementById('prev-page').disabled = result.page <= 1;
  document.getElementById('next-page').disabled = result.page >= totalPages;
}

async function loadAll() {
  await Promise.all([loadCampaignHeader(), loadMessages()]);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!campaignId) {
    document.getElementById('detalhe-nome').textContent = 'Campanha não informada';
    return;
  }

  loadAll();

  document.getElementById('status-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    currentPage = 1;
    loadMessages();
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      loadMessages();
    }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    currentPage += 1;
    loadMessages();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadAll();
  });
});
