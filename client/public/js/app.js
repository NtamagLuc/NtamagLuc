import { route, startRouter } from './router.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCentraleDetail } from './pages/centrale.js';
import { renderActifDetail } from './pages/actif.js';
import { renderHistorique } from './pages/historique.js';

route('/', renderDashboard);
route('/centrales/:id', renderCentraleDetail);
route('/actifs/:id', renderActifDetail);
route('/historique', renderHistorique);

startRouter();
