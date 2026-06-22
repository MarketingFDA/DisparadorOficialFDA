document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('numbers-tbody');
  if (!tbody) return;

  const formPanel = document.getElementById('numero-form-panel');
  const form = document.getElementById('numero-form');
  const metaFields = document.getElementById('meta-fields');
  const evolutionFields = document.getElementById('evolution-fields');

  async function loadNumbers() {
    try {
      const numbers = await api.numbers.list();
      tbody.innerHTML =
        numbers.length === 0
          ? '<tr><td colspan="5" class="empty-state">Nenhum número cadastrado ainda.</td></tr>'
          : numbers
              .map((n) => {
                const isMeta = n.channel === 'META_CLOUD_API';
                const badgeClass = isMeta ? 'badge-channel-meta' : 'badge-channel-evolution';
                const badgeLabel = isMeta ? 'Meta Oficial' : 'WhatsApp Normal';
                const identifier = isMeta ? (n.phoneNumberId || '—') : (n.evolutionInstanceName || '—');
                return `
                  <tr>
                    <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                    <td>${escapeHtml(n.label)}</td>
                    <td>${escapeHtml(n.displayNumber || '—')}</td>
                    <td>${escapeHtml(identifier)}</td>
                    <td>${n.isTestNumber ? 'Teste' : 'Produção'}</td>
                  </tr>
                `;
              })
              .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro ao carregar números: ${escapeHtml(err.message)}</td></tr>`;
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
      await api.numbers.create(body);
      showToast('Número cadastrado com sucesso!', 'success');
      form.reset();
      toggleChannelFields();
      formPanel.style.display = 'none';
      await loadNumbers();
    } catch (err) {
      showToast(`Erro ao cadastrar número: ${err.message}`, 'error');
    }
  });

  await loadNumbers();
});
