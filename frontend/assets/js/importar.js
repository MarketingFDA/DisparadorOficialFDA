document.addEventListener('DOMContentLoaded', () => {
  const importBtn = document.getElementById('import-btn');
  if (!importBtn) return;

  importBtn.addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file');
    const groupNameInput = document.getElementById('import-group-name');
    const resultEl = document.getElementById('import-result');
    const groupSelect = document.getElementById('campaign-group');

    const file = fileInput.files[0];
    if (!file) {
      resultEl.textContent = 'Selecione um arquivo .xlsx primeiro.';
      resultEl.style.color = '#ff8585';
      return;
    }

    const groupName = groupNameInput.value.trim() || `Importação ${new Date().toLocaleString('pt-BR')}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('groupName', groupName);

    importBtn.disabled = true;
    resultEl.textContent = 'Importando…';
    resultEl.style.color = '';

    try {
      const result = await api.contacts.import(formData);
      resultEl.style.color = '#6df0a4';
      resultEl.textContent = `Importados: ${result.imported} · Ignorados: ${result.skipped}${
        result.errors.length ? ` · ${result.errors.length} erro(s)` : ''
      }`;
      await loadGroupsIntoSelect(groupSelect, result.groupId);
    } catch (err) {
      resultEl.style.color = '#ff8585';
      resultEl.textContent = `Erro ao importar: ${err.message}`;
    } finally {
      importBtn.disabled = false;
    }
  });
});

async function loadGroupsIntoSelect(selectEl, selectedGroupId) {
  const groups = await api.contacts.groups();
  selectEl.innerHTML = groups
    .map(
      (g) =>
        `<option value="${g.id}" ${g.id === selectedGroupId ? 'selected' : ''}>${escapeHtml(g.name)} (${g._count.contacts} contatos)</option>`,
    )
    .join('');
}
