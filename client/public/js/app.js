import { route, startRouter } from './router.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCentraleDetail } from './pages/centrale.js';
import { renderActifDetail } from './pages/actif.js';
import { renderHistorique } from './pages/historique.js';
import { renderDemandes } from './pages/demandes.js';
import { renderDemandeDetail } from './pages/demandeDetail.js';
import { renderUtilisateurs } from './pages/utilisateurs.js';
import { renderReporting } from './pages/reporting.js';

route('/login', renderLogin);
route('/', renderDashboard);
route('/centrales/:id', renderCentraleDetail);
route('/actifs/:id', renderActifDetail);
route('/demandes', renderDemandes);
route('/demandes/:id', renderDemandeDetail);
route('/utilisateurs', renderUtilisateurs);
route('/reporting', renderReporting);
route('/historique', renderHistorique);

startRouter();
