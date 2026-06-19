document.addEventListener('DOMContentLoaded', () => {
  const menu = document.getElementById('exportar-menu');
  if (!menu) return;

  menu.addEventListener('click', (e) => {
    const type = e.target.dataset.export;
    if (!type) return;
    menu.classList.remove('open');

    const urls = {
      print: `${API_BASE_URL}/export/campaigns/print`,
      csv: `${API_BASE_URL}/export/campaigns.csv`,
      xlsx: `${API_BASE_URL}/export/campaigns.xlsx`,
      pdf: `${API_BASE_URL}/export/campaigns.pdf`,
    };
    window.open(urls[type], '_blank');
  });
});
