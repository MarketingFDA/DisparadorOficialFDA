document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('campaign-form');
  if (!form) return;

  const numberSelect = document.getElementById('campaign-number');
  const templateSelect = document.getElementById('campaign-template');
  const groupSelect = document.getElementById('campaign-group');
  const messageInput = document.getElementById('campaign-message');
  const metaFields = document.getElementById('meta-campaign-fields');
  const evolutionFields = document.getElementById('evolution-campaign-fields');

  let allNumbers = [];

  function currentChannel() {
    return form.querySelector('input[name="channel"]:checked').value;
  }

  function renderNumberOptions() {
    const channel = currentChannel();
    const filtered = allNumbers.filter((n) => n.channel === channel);
    numberSelect.innerHTML =
      filtered.length === 0
        ? '<option value="">Nenhum número cadastrado nesse canal — cadastre em "Números"</option>'
        : filtered
            .map((n) => `<option value="${n.id}">${escapeHtml(n.label)} — ${escapeHtml(n.displayNumber || n.phoneNumberId || n.evolutionInstanceName || '')}</option>`)
            .join('');

    if (channel === 'META_CLOUD_API') {
      metaFields.style.display = '';
      evolutionFields.style.display = 'none';
      if (filtered.length > 0) loadTemplatesForNumber(filtered[0].id, templateSelect);
    } else {
      metaFields.style.display = 'none';
      evolutionFields.style.display = '';
    }
  }

  form.querySelectorAll('input[name="channel"]').forEach((radio) => {
    radio.addEventListener('change', renderNumberOptions);
  });

  try {
    const [numbers, groups] = await Promise.all([api.numbers.list(), api.contacts.groups()]);
    allNumbers = numbers;
    renderNumberOptions();

    groupSelect.innerHTML =
      groups.length === 0
        ? '<option value="">Importe destinatários abaixo para criar um grupo</option>'
        : groups
            .map((g) => `<option value="${g.id}">${escapeHtml(g.name)} (${g._count.contacts} contatos)</option>`)
            .join('');

    numberSelect.addEventListener('change', () => {
      if (currentChannel() === 'META_CLOUD_API') loadTemplatesForNumber(numberSelect.value, templateSelect);
    });
  } catch (err) {
    showToast(`Não foi possível carregar números/grupos: ${err.message}`, 'error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channel = currentChannel();
    const name = document.getElementById('campaign-name').value.trim();
    const whatsAppNumberId = numberSelect.value;
    const groupId = groupSelect.value;

    if (!name || !whatsAppNumberId || !groupId) {
      showToast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    const body = { name, whatsAppNumberId, groupId };
    const scheduleInput = document.getElementById('campaign-schedule').value;
    if (scheduleInput) body.scheduledAt = new Date(scheduleInput).toISOString();
    if (channel === 'META_CLOUD_API') {
      if (!templateSelect.value) {
        showToast('Selecione um template aprovado.', 'error');
        return;
      }
      body.templateId = templateSelect.value;
    } else {
      const messageText = messageInput.value.trim();
      if (!messageText) {
        showToast('Escreva a mensagem a ser enviada.', 'error');
        return;
      }
      body.messageText = messageText;
    }

    try {
      await api.campaigns.create(body);
      showToast(body.scheduledAt ? 'Campanha agendada com sucesso!' : 'Campanha criada com sucesso!', 'success');
      setTimeout(() => (window.location.href = 'index.html'), 800);
    } catch (err) {
      showToast(`Erro ao criar campanha: ${err.message}`, 'error');
    }
  });
});

async function loadTemplatesForNumber(numberId, templateSelect) {
  if (!numberId) {
    templateSelect.innerHTML = '<option value="">Selecione um número primeiro</option>';
    return;
  }
  try {
    const templates = await api.templates.list(numberId);
    const approved = templates.filter((t) => t.status === 'APPROVED');
    templateSelect.innerHTML =
      approved.length === 0
        ? '<option value="">Nenhum template aprovado — clique em "Sincronizar" na Meta</option>'
        : approved.map((t) => `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.category)})</option>`).join('');
  } catch (err) {
    templateSelect.innerHTML = '<option value="">Erro ao carregar templates</option>';
  }
}
