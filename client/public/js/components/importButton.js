import { showToast } from '../utils.js';
import { refresh } from '../router.js';

// Branche un bouton "Importer" sur un <input type="file"> caché : au choix d'un fichier,
// appelle importFn(file) (CSV ou Excel .xlsx) et affiche un rapport de résultat.
export function setupImportButton(btnId, inputId, importFn) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const rapport = await importFn(file);
      showToast(
        `Import terminé : ${rapport.crees} créé(s), ${rapport.misAJour} mis à jour${rapport.erreurs.length ? `, ${rapport.erreurs.length} erreur(s)` : ''}.`,
        rapport.erreurs.length ? 'error' : 'success'
      );
      if (rapport.erreurs.length) console.warn(`Erreurs import (${btnId}) :`, rapport.erreurs);
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      input.value = '';
    }
  });
}
