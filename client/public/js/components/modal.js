export function openModal(title, bodyHtml, { onMount, wide } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-dialog ${wide ? 'modal-wide' : ''}">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" data-close aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  function close() {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') || e.target.closest('[data-close]')) {
      close();
    }
  });
  document.addEventListener('keydown', onKeydown);

  if (onMount) onMount(root.querySelector('.modal-dialog'), close);

  return close;
}
