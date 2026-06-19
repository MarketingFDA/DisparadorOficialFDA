document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('campaign-form');
  if (!form) return;

  const numberSelect = document.getElementById('campaign-number');
  const templateSelect = document.getElementById('campaign-template');
  const groupSelect = document.getElementById('campaign-group');

  try {
    const [numbers, groups] = await Promise.all([api.numbers.list(), api.contacts.groups()]);

    numberSelect.innerHTML =
      numbers.length === 0
        ? '<option value="">Nenhum número cadastrado ainda</option>'
        : numbers
            .map((n) => `<option value="${n.id}">${escapeHtml(n.label)} — ${escapeHtml(n.displayNumber || n.phoneNumberId)}</option>`)
            .join('');

    groupSelect.innerHTML =
      groups.length === 0
        ? '<option value="">Importe destinatários abaixo para criar um grupo</option>'
        : groups
            .map((g) => `<option value="${g.id}">${escapeHtml(g.name)} (${g._count.contacts} contatos)</option>`)
            .join('');

    if (numbers.length > 0) await loadTemplatesForNumber(numbers[0].id, templateSelect);
    numberSelect.addEventListener('change', () => loadTemplatesForNumber(numberSelect.value, templateSelect));
  } catch (err) {
    showToast(`Não foi possível carregar números/grupos: ${err.message}`, 'error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('campaign-name').value.trim();
    const whatsAppNumberId = numberSelect.value;
    const templateId = templateSelect.value;
    const groupId = groupSelect.value;

    if (!name || !whatsAppNumberId || !templateId || !groupId) {
      showToast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    try {
      await api.campaigns.create({ name, whatsAppNumberId, templateId, groupId });
      showToast('Campanha criada com sucesso!', 'success');
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
