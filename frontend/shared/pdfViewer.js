(function () {
  let pdf = null, page = 1, scale = 1.25;
  const $ = id => document.getElementById(id);

  async function render() {
    if (!pdf) return;
    const canvas = $('pdf-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const current = await pdf.getPage(page);
    const viewport = current.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await current.render({ canvasContext: ctx, viewport }).promise;
    if ($('pdf-page-label')) {
      $('pdf-page-label').textContent = `Page ${page} of ${pdf.numPages}`;
    }
    if ($('pdf-prev')) $('pdf-prev').disabled = page <= 1;
    if ($('pdf-next')) $('pdf-next').disabled = page >= pdf.numPages;
  }

  async function openPDF(url, title) {
    if ($('pdf-title')) $('pdf-title').textContent = title || 'Document preview';
    if ($('pdf-open-tab')) {
      $('pdf-open-tab').href = url || '#';
      $('pdf-open-tab').target = '_blank';
    }
    const modal = $('pdf-modal');
    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
    }

    if (!url) {
      if ($('pdf-error')) {
        $('pdf-error').hidden = false;
        $('pdf-error').textContent = 'Document URL is not available.';
      }
      return;
    }

    try {
      if (!window.pdfjsLib) {
        throw new Error('PDF library unavailable');
      }
      pdf = await pdfjsLib.getDocument({ url }).promise;
      page = 1;
      if ($('pdf-error')) $('pdf-error').hidden = true;
      await render();
    } catch (err) {
      if ($('pdf-error')) {
        $('pdf-error').hidden = false;
        $('pdf-error').innerHTML = `Preview cannot render in canvas. Use the <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">Open in Tab</a> button to view or download the document directly.`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('pdf-prev')?.addEventListener('click', () => { if (page > 1) { page--; render(); } });
    $('pdf-next')?.addEventListener('click', () => { if (pdf && page < pdf.numPages) { page++; render(); } });
    $('pdf-close')?.addEventListener('click', () => $('pdf-modal')?.close());
  });

  window.openPDF = openPDF;
}());
