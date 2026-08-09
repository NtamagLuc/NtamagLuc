import { route, startRouter } from './router.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCentraleDetail } from './pages/centrale.js';
import { renderActifDetail } from './pages/actif.js';
import { renderHistorique } from './pages/historique.js';
import { renderDemandes } from './pages/demandes.js';
import { renderDemandeDetail } from './pages/demandeDetail.js';
import { renderNapt } from './pages/napt.js';
import { renderUtilisateurs } from './pages/utilisateurs.js';
import { renderReporting } from './pages/reporting.js';
import { renderParametres } from './pages/parametres.js';
import { renderEntreprises } from './pages/entreprises.js';

route('/login', renderLogin);
route('/', renderDashboard);
route('/centrales/:id', renderCentraleDetail);
route('/actifs/:id', renderActifDetail);
route('/demandes', renderDemandes);
route('/demandes/:id', renderDemandeDetail);
route('/demandes/:id/napt', renderNapt);
route('/utilisateurs', renderUtilisateurs);
route('/reporting', renderReporting);
route('/historique', renderHistorique);
route('/parametres', renderParametres);
route('/entreprises', renderEntreprises);

startRouter();
