import { api } from '../api.js';
import { escapeHtml, formatDate, formatNombre, DEMANDE_TYPE_LABELS } from '../utils.js';

// Génère une version imprimable de la NAPT (Note d'Arrêt pour Travaux Production),
// annexe 4/10 du mémo SOCAD'EL, pré-remplie avec les données de la demande. Les champs
// que l'application ne suit pas (référence note d'info, entreprise désignée, clients
// industriels…) restent éditables à l'écran avant impression : ce sont des champs
// papier destinés à être complétés par le CCR / le responsable technique régional.

function formatDateSimple(isoDate) {
  if (!isoDate) return '';
  const [annee, mois, jour] = isoDate.split('-');
  return jour && mois && annee ? `${jour}/${mois}/${annee}` : isoDate;
}

function dateEtHeure(iso) {
  if (!iso) return { date: '', heure: '' };
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return { date: '', heure: '' };
  return {
    date: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' }).format(d),
    heure: new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'UTC' }).format(d),
  };
}

function champEditable(valeur = '') {
  return `<input type="text" class="napt-input" value="${escapeHtml(valeur)}" />`;
}

export async function renderNapt({ id }) {
  const app = document.getElementById('app');
  const demande = await api.getDemande(id);
  const centrale = await api.getCentrale(demande.centrale_source_id);

  const descendants = (demande.simulation?.descendants?.length ? demande.simulation.descendants : demande.simulationActuelle?.descendants) || [];
  const lignesOuvrages = descendants.length ? descendants : [{ nom: demande.actif_nom, contribution_mw: null }];

  // Les demandes de retrait créées via le formulaire renseignent ces champs ; à défaut
  // (anciennes demandes, décommissionnement), on retombe sur la date d'exécution du
  // mouvement et sur des champs vides éditables.
  const aCoupureSaisie = !!(demande.date_debut_coupure || demande.heure_debut_coupure);
  const debut = aCoupureSaisie
    ? { date: formatDateSimple(demande.date_debut_coupure), heure: demande.heure_debut_coupure || '' }
    : dateEtHeure(demande.mouvement?.date || demande.date_execution || demande.date_approbation);
  const puissanceTotale = lignesOuvrages.reduce((s, a) => s + (a.contribution_mw || 0), 0);
  // Les demandes de retrait transmises portent un code DDR officiel (DDR_AA/JJ/MM/YY/ZZ-nom
  // de la centrale), généré à la validation par le chargé d'exploitation. À défaut (autres
  // types de demande, ou anciennes demandes transmises avant ce champ), on retombe sur une
  // référence NAPT générique basée sur l'identifiant de la demande.
  const reference = demande.code_reference || `NAPT-${String(demande.id).padStart(4, '0')}`;

  app.innerHTML = `
    <div class="napt-toolbar no-print">
      <a class="back-link" href="#/demandes/${demande.id}">← Retour à la demande</a>
      <button class="btn btn-primary" id="napt-print-btn">🖨️ Imprimer / Enregistrer en PDF</button>
    </div>

    <div class="napt-doc">
      <div class="napt-header">
        <img class="napt-logo" src="/assets/socadel-logo.jpeg" alt="SOCAD'EL" />
      </div>

      <table class="napt-table">
        <tr>
          <td colspan="2" class="napt-title-cell">
            <div class="napt-societe">SOCIETE CAMEROUNAISE D'ELECTRICITE</div>
            <div class="napt-titre">NOTE D'ARRET POUR TRAVAUX<br />PRODUCTION</div>
          </td>
          <td class="napt-ref-cell">
            <div class="napt-field-row"><span class="napt-label">Référence :</span> <strong>${escapeHtml(reference)}</strong></div>
          </td>
          <td class="napt-segment-cell">
            <div class="napt-field-row"><span class="napt-label">Segment :</span> <strong>PRODUCTION</strong></div>
            <div class="napt-field-row"><span class="napt-label">Région Electrique :</span> ${champEditable(centrale.region_electrique || '')}</div>
          </td>
        </tr>

        <tr><td colspan="4" class="napt-section-title">Identification de l'unité demanderesse</td></tr>
        <tr>
          <td colspan="2" class="napt-cell-label">UNITE DEMANDERESSE :</td>
          <td colspan="2" class="napt-cell-value">${escapeHtml(demande.demandeur_nom)}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Date de réception de la Note d'information :</td>
          <td colspan="2" class="napt-cell-value">${champEditable(demande.date_exploitation ? formatDate(demande.date_exploitation) : '')}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">N° Référence Note d'information :</td>
          <td colspan="2" class="napt-cell-value">${champEditable()}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Nom du Responsable Centrale concerné :</td>
          <td colspan="2" class="napt-cell-value">${escapeHtml(demande.approbateur_nom || '')}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Entreprise(s) désignée(s) pour les travaux :</td>
          <td colspan="2" class="napt-cell-value">${champEditable()}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Centrale concernée :</td>
          <td colspan="2" class="napt-cell-value">${escapeHtml(centrale.nom)} (${escapeHtml(centrale.code)})</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label" style="vertical-align:top;">Consistance des travaux :</td>
          <td colspan="2" class="napt-cell-value">${escapeHtml(demande.motif || '')}${demande.type === 'DECOMMISSIONNEMENT' ? ` (${DEMANDE_TYPE_LABELS[demande.type]} — état cible : ${escapeHtml(demande.etat_cible || '')})` : ` (${DEMANDE_TYPE_LABELS[demande.type] || demande.type})`}</td>
        </tr>

        <tr><td colspan="4" class="napt-section-title">Ouvrages et localités impactés</td></tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Nombre de départs sur la rame :</td>
          <td colspan="2" class="napt-cell-value">${demande.nb_departs_rame !== null && demande.nb_departs_rame !== undefined ? demande.nb_departs_rame : champEditable()}</td>
        </tr>
        <tr>
          <td colspan="2" class="napt-cell-label">Nombre de départs impactés par la coupure :</td>
          <td colspan="2" class="napt-cell-value">${demande.nb_departs_impactes !== null && demande.nb_departs_impactes !== undefined ? demande.nb_departs_impactes : champEditable()}</td>
        </tr>
        <tr class="napt-table-head-row">
          <td class="napt-th">Ouvrage / actif impacté</td>
          <td class="napt-th">Date début coupure</td>
          <td class="napt-th">Heure début coupure</td>
          <td class="napt-th">Puissance coupée (MW)</td>
        </tr>
        ${lignesOuvrages
          .map(
            (a) => `
          <tr>
            <td class="napt-td">${escapeHtml(a.nom)}${a.code ? ` <span class="napt-code">(${escapeHtml(a.code)})</span>` : ''}</td>
            <td class="napt-td">${champEditable(debut.date)}</td>
            <td class="napt-td">${champEditable(debut.heure)}</td>
            <td class="napt-td">${a.contribution_mw ? formatNombre(a.contribution_mw) : champEditable()}</td>
          </tr>
        `
          )
          .join('')}
        <tr>
          <td class="napt-td" style="text-align:right;"><strong>Puissance totale coupée :</strong></td>
          <td class="napt-td" colspan="2"></td>
          <td class="napt-td"><strong>${puissanceTotale ? `${formatNombre(puissanceTotale)} MW` : '—'}</strong></td>
        </tr>
        <tr>
          <td colspan="4" class="napt-cell-label">
            Date retour en exploitation : ${champEditable(formatDateSimple(demande.date_retour_exploitation))} &nbsp;&nbsp; Heure fin coupure : ${champEditable(demande.heure_fin_coupure || '')}
          </td>
        </tr>
        <tr>
          <td colspan="4" class="napt-cell-label" style="vertical-align:top;">
            Liste des départs impactés <em>(mettre en vert les départs partiellement/totalement repris par une autre source)</em> :
            <div class="napt-blank-area" contenteditable="true">${escapeHtml(demande.liste_departs_impactes || '')}</div>
          </td>
        </tr>

        <tr>
          <td class="napt-cell-label">Clients Industriels impactés ? (cocher la case)</td>
          <td class="napt-cell-value"><label><input type="checkbox" /> OUI</label> &nbsp; <label><input type="checkbox" /> NON</label></td>
          <td colspan="2" class="napt-cell-label">Si Oui, préciser lesquels : ${champEditable()}</td>
        </tr>
        <tr>
          <td colspan="4" class="napt-cell-label" style="vertical-align:top;">
            Liste des localités impactées :
            <div class="napt-blank-area" contenteditable="true">${escapeHtml(centrale.localisation || '')}</div>
          </td>
        </tr>

        <tr><td colspan="4" class="napt-section-title" style="text-align:center;">Consignes Générales / Observations Générales</td></tr>
        <tr>
          <td colspan="4" class="napt-blank-area" contenteditable="true">${[demande.commentaire_exploitation, demande.commentaire_approbation].filter(Boolean).map(escapeHtml).join(' — ')}</td>
        </tr>

        <tr>
          <td colspan="4" class="napt-signature-cell">
            <div>RESPONSABLE CCR / Responsable Technique Régional (pour les régions sans CCR)</div>
            <div class="napt-signature-line">${escapeHtml(demande.approbateur_nom || '')}</div>
          </td>
        </tr>
      </table>
    </div>
  `;

  document.getElementById('napt-print-btn').addEventListener('click', () => window.print());
}
