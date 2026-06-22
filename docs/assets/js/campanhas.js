let campaignsCache = [];
let selectedIds = new Set();

const STATUS_LABEL = {
  DRAFT: 'Rascunho',
  QUEUED: 'Na fila',
  SENDING: 'Ativo',
  PAUSED: 'Pausado',
  COMPLETED: 'Finalizado',
  FAILED: 'Erro',
};
const STATUS_CLASS = {
  DRAFT: 'badge-draft',
  QUEUED: 'badge-sending',
  SENDING: 'badge-sending',
  PAUSED: 'badge-paused',
  COMPLETED: 'badge-completed',
  FAILED: 'badge-failed',
};

async function loadCampaigns(search) {
  const tbody = document.getElementById('campaigns-tbody');
  try {
    campaignsCache = await api.campaigns.list(search);
    renderCampaigns(campaignsCache);
    renderStats(campaignsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Não foi possível carregar campanhas (${escapeHtml(err.message)}). Verifique se o backend está rodando.</td></tr>`;
    document.getElementById('stats-tbody').innerHTML =
      '<tr><td colspan="7" class="empty-state">—</td></tr>';
  }
}

function renderCampaigns(campaigns) {
  const tbody = document.getElementById('campaigns-tbody');
  document.getElementById('campaigns-count').textContent = `Mostrando ${campaigns.length} registro(s)`;

  if (campaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma campanha cadastrada ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = campaigns
    .map((c) => {
      const statusLabel = STATUS_LABEL[c.status] || c.status;
      const statusClass = STATUS_CLASS[c.status] || 'badge-draft';
      const numero = c.whatsAppNumber?.displayNumber || c.whatsAppNumber?.phoneNumberId || c.whatsAppNumber?.evolutionInstanceName || '—';
      const template = c.template?.name || (c.messageText ? `${c.messageText.slice(0, 40)}${c.messageText.length > 40 ? '…' : ''}` : '—');
      return `
        <tr data-id="${c.id}">
          <td><input type="checkbox" class="row-check" data-id="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} /></td>
          <td><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(numero)}</td>
          <td>${escapeHtml(template)}</td>
          <td>
            <select class="row-select" data-id="${c.id}">
              <option value="">Selecione</option>
              <option value="dispatch">▶ Disparar</option>
              <option value="pause">⏸ Pausar</option>
              <option value="sync">⟳ Sincronizar</option>
              <option value="delete">🗑 Excluir</option>
            </select>
          </td>
        </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.row-check').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.id;
      if (el.checked) selectedIds.add(id);
      else selectedIds.delete(id);
    });
  });

  tbody.querySelectorAll('.row-select').forEach((el) => {
    el.addEventListener('change', async () => {
      const id = el.dataset.id;
      const action = el.value;
      el.value = '';
      if (!action) return;
      await handleRowAction(id, action);
    });
  });
}

function renderStats(campaigns) {
  const tbody = document.getElementById('stats-tbody');
  if (campaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Sem dados ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = campaigns
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.totalCount}</td>
        <td>${c.queuedCount}</td>
        <td>${c.sentCount}</td>
        <td>${c.deliveredCount}</td>
        <td>${c.readCount}</td>
        <td>${c.errorCount}</td>
      </tr>`,
    )
    .join('');
}

async function handleRowAction(id, action) {
  try {
    if (action === 'dispatch') {
      await api.campaigns.dispatch(id);
      showToast('Campanha disparada. Acompanhe as estatísticas abaixo.', 'success');
    } else if (action === 'pause') {
      await api.campaigns.pause(id);
      showToast('Campanha pausada.', 'success');
    } else if (action === 'sync') {
      await api.campaigns.sync(id);
      showToast('Estatísticas sincronizadas.', 'success');
    } else if (action === 'delete') {
      confirmAction('Excluir campanha', 'Essa ação não pode ser desfeita. Confirma a exclusão?', async () => {
        await api.campaigns.remove(id);
        showToast('Campanha excluída.', 'success');
        await loadCampaigns(currentSearch());
      });
      return;
    }
    await loadCampaigns(currentSearch());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function currentSearch() {
  return document.getElementById('search-input').value.trim();
}

function setupDropdown(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-menu.open').forEach((m) => {
      if (m !== menu) m.classList.remove('open');
    });
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.addEventListener('click', (e) => e.stopPropagation());
}

function confirmAction(title, message, onConfirm) {
  const backdrop = document.getElementById('modal-backdrop');
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  backdrop.classList.add('open');
  modal.classList.add('open');

  const close = () => {
    backdrop.classList.remove('open');
    modal.classList.remove('open');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', close);
    backdrop.removeEventListener('click', close);
  };
  const onOk = async () => {
    close();
    await onConfirm();
  };
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
}

document.addEventListener('DOMContentLoaded', () => {
  loadCampaigns();

  setupDropdown('acoes-btn', 'acoes-menu');
  setupDropdown('exportar-btn', 'exportar-menu');

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(window.__searchTimeout);
    window.__searchTimeout = setTimeout(() => loadCampaigns(e.target.value.trim()), 300);
  });

  document.getElementById('select-all').addEventListener('change', (e) => {
    selectedIds = new Set(e.target.checked ? campaignsCache.map((c) => c.id) : []);
    renderCampaigns(campaignsCache);
  });

  document.getElementById('acoes-menu').addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    document.getElementById('acoes-menu').classList.remove('open');

    if (action === 'adicionar') {
      window.location.href = 'campanha.html';
      return;
    }
    if (action === 'sincronizar') {
      for (const c of campaignsCache) await api.campaigns.sync(c.id).catch(() => {});
      showToast('Todas as campanhas sincronizadas.', 'success');
      await loadCampaigns(currentSearch());
      return;
    }
    if (action === 'limpar-filtro') {
      document.getElementById('search-input').value = '';
      await loadCampaigns();
      return;
    }
    if (action === 'filtro-avancado' || action === 'favoritar-filtro' || action === 'remover-favorito') {
      showToast('Recurso disponível em uma próxima versão.', '');
      return;
    }
    if (action === 'excluir-selecionados') {
      if (selectedIds.size === 0) {
        showToast('Selecione ao menos uma campanha.', 'error');
        return;
      }
      confirmAction(
        'Excluir selecionados',
        `${selectedIds.size} campanha(s) serão excluídas permanentemente. Confirma?`,
        async () => {
          await api.campaigns.bulkDelete([...selectedIds]);
          selectedIds.clear();
          showToast('Campanhas excluídas.', 'success');
          await loadCampaigns(currentSearch());
        },
      );
      return;
    }
    if (action === 'excluir-todos') {
      confirmAction(
        'Excluir todas as campanhas',
        'Isso vai apagar TODAS as campanhas cadastradas. Essa ação não pode ser desfeita. Confirma?',
        async () => {
          await api.campaigns.removeAll();
          selectedIds.clear();
          showToast('Todas as campanhas foram excluídas.', 'success');
          await loadCampaigns();
        },
      );
    }
  });
});
