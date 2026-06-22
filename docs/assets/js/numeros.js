document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('numbers-tbody');
  if (!tbody) return;

  const formPanel = document.getElementById('numero-form-panel');
  const form = document.getElementById('numero-form');
  const metaFields = document.getElementById('meta-fields');
  const evolutionFields = document.getElementById('evolution-fields');

  const qrBackdrop = document.getElementById('qrcode-backdrop');
  const qrModal = document.getElementById('qrcode-modal');
  const qrBox = document.getElementById('qrcode-box');
  const qrStatus = document.getElementById('qrcode-status');
  let pollTimer = null;

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function closeQrModal() {
    stopPolling();
    qrBackdrop.classList.remove('open');
    qrModal.classList.remove('open');
  }

  async function openQrModal(numberId) {
    qrBox.innerHTML = '<div class="empty-state">Gerando QR Code…</div>';
    qrStatus.textContent = 'Abra o WhatsApp no celular do número, vá em Aparelhos conectados → Conectar um aparelho e escaneie o código abaixo.';
    qrBackdrop.classList.add('open');
    qrModal.classList.add('open');

    await refreshQrCode(numberId);
    stopPolling();
    pollTimer = setInterval(() => checkConnection(numberId), 4000);
  }

  async function refreshQrCode(numberId) {
    try {
      const { base64 } = await api.numbers.qrcode(numberId);
      qrBox.innerHTML = base64
        ? `<img src="${base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`}" alt="QR Code" />`
        : '<div class="empty-state">QR Code ainda não disponível, aguarde…</div>';
    } catch (err) {
      qrBox.innerHTML = `<div class="empty-state">Erro ao buscar QR Code: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function checkConnection(numberId) {
    try {
      const { state } = await api.numbers.status(numberId);
      if (state === 'open') {
        stopPolling();
        qrStatus.textContent = '✅ Conectado! Esse número já pode ser usado em campanhas.';
        qrBox.innerHTML = '<div class="empty-state">Conectado</div>';
        showToast('Número conectado com sucesso!', 'success');
        await loadNumbers();
        setTimeout(closeQrModal, 1500);
      } else {
        await refreshQrCode(numberId);
      }
    } catch (err) {
      qrStatus.textContent = `Erro ao checar status: ${err.message}`;
    }
  }

  document.getElementById('qrcode-close').addEventListener('click', closeQrModal);
  qrBackdrop.addEventListener('click', closeQrModal);

  async function loadNumbers() {
    try {
      const numbers = await api.numbers.list();
      tbody.innerHTML =
        numbers.length === 0
          ? '<tr><td colspan="7" class="empty-state">Nenhum número cadastrado ainda.</td></tr>'
          : numbers
              .map((n) => {
                const isMeta = n.channel === 'META_CLOUD_API';
                const badgeClass = isMeta ? 'badge-channel-meta' : 'badge-channel-evolution';
                const badgeLabel = isMeta ? 'Meta Oficial' : 'WhatsApp Normal';
                const identifier = isMeta ? (n.phoneNumberId || '—') : (n.evolutionInstanceName || '—');
                const statusCell = isMeta
                  ? '<span class="field-hint">—</span>'
                  : `<span class="badge" data-status-for="${n.id}">verificando…</span>`;
                const actionsCell = isMeta
                  ? '—'
                  : `<button type="button" class="btn btn-secondary btn-connect" data-id="${n.id}">Conectar</button>`;
                return `
                  <tr>
                    <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                    <td>${escapeHtml(n.label)}</td>
                    <td>${escapeHtml(n.displayNumber || '—')}</td>
                    <td>${escapeHtml(identifier)}</td>
                    <td>${n.isTestNumber ? 'Teste' : 'Produção'}</td>
                    <td>${statusCell}</td>
                    <td>${actionsCell}</td>
                  </tr>
                `;
              })
              .join('');

      tbody.querySelectorAll('.btn-connect').forEach((btn) => {
        btn.addEventListener('click', () => openQrModal(btn.dataset.id));
      });

      numbers
        .filter((n) => n.channel === 'EVOLUTION_API')
        .forEach(async (n) => {
          const el = tbody.querySelector(`[data-status-for="${n.id}"]`);
          if (!el) return;
          try {
            const { state } = await api.numbers.status(n.id);
            const map = { open: ['Conectado', 'badge-status-open'], connecting: ['Aguardando QR', 'badge-status-connecting'] };
            const [label, cls] = map[state] || ['Desconectado', 'badge-status-close'];
            el.textContent = label;
            el.className = `badge ${cls}`;
          } catch {
            el.textContent = 'Erro ao checar';
            el.className = 'badge badge-status-close';
          }
        });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Erro ao carregar números: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function toggleChannelFields() {
    const channel = form.querySelector('input[name="channel"]:checked').value;
    const isMeta = channel === 'META_CLOUD_API';
    metaFields.style.display = isMeta ? '' : 'none';
    evolutionFields.style.display = isMeta ? 'none' : '';
  }

  form.querySelectorAll('input[name="channel"]').forEach((radio) => {
    radio.addEventListener('change', toggleChannelFields);
  });

  document.getElementById('novo-numero-btn').addEventListener('click', () => {
    formPanel.style.display = formPanel.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('cancelar-numero-btn').addEventListener('click', () => {
    formPanel.style.display = 'none';
    form.reset();
    toggleChannelFields();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channel = form.querySelector('input[name="channel"]:checked').value;
    const label = document.getElementById('numero-label').value.trim();
    const displayNumber = document.getElementById('numero-display').value.trim() || undefined;

    const body = { channel, label, displayNumber };
    if (channel === 'META_CLOUD_API') {
      body.phoneNumberId = document.getElementById('numero-phone-id').value.trim();
      body.wabaId = document.getElementById('numero-waba-id').value.trim();
      if (!body.phoneNumberId || !body.wabaId) {
        showToast('Preencha Phone Number ID e WABA ID.', 'error');
        return;
      }
    } else {
      body.evolutionInstanceName = document.getElementById('numero-instance').value.trim();
      if (!body.evolutionInstanceName) {
        showToast('Preencha o nome da instância da Evolution API.', 'error');
        return;
      }
    }

    if (!label) {
      showToast('Preencha o label do número.', 'error');
      return;
    }

    try {
      const created = await api.numbers.create(body);
      showToast('Número cadastrado com sucesso!', 'success');
      form.reset();
      toggleChannelFields();
      formPanel.style.display = 'none';
      await loadNumbers();
      if (channel === 'EVOLUTION_API') await openQrModal(created.id);
    } catch (err) {
      showToast(`Erro ao cadastrar número: ${err.message}`, 'error');
    }
  });

  await loadNumbers();
});
