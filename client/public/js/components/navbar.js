import { api } from '../api.js';
import { getCurrentUser, logout, isAdmin } from '../auth.js';
import { escapeHtml, ROLE_LABELS, formatDate } from '../utils.js';
import { refresh } from '../router.js';

let notifications = [];
let dropdownOpen = false;
let pollStarted = false;

async function refreshNotifications() {
  const user = getCurrentUser();
  if (!user) {
    notifications = [];
    return;
  }
  try {
    notifications = await api.getNotifications();
  } catch {
    notifications = [];
  }
}

function startPolling() {
  if (pollStarted) return;
  pollStarted = true;
  setInterval(async () => {
    await refreshNotifications();
    renderNotifDropdown();
    updateBellBadge();
  }, 20000);
}

function isActive(path) {
  const current = (location.hash.slice(1) || '/').split('?')[0];
  if (path === '/') return current === '/';
  return current.startsWith(path);
}

export async function renderNavbar() {
  const root = document.getElementById('sidebar-root');
  const user = getCurrentUser();

  if (!user) {
    root.innerHTML = '';
    document.body.classList.remove('has-sidebar');
    return;
  }
  document.body.classList.add('has-sidebar');

  await refreshNotifications();
  startPolling();

  const links = [
    { path: '/', label: 'Tableau de bord', icon: '🏠' },
    { path: '/demandes', label: 'Demandes', icon: '📋' },
    { path: '/historique', label: 'Historique', icon: '🕘' },
    { path: '/reporting', label: 'Reporting', icon: '📊' },
  ];
  if (isAdmin()) {
    links.push({ path: '/utilisateurs', label: 'Utilisateurs', icon: '👥' });
    links.push({ path: '/parametres', label: 'Paramètres', icon: '⚙️' });
  }

  root.innerHTML = `
    <div class="sidebar-brand">
      <img src="/assets/socadel-logo.jpeg" alt="SOCAD'EL" class="sidebar-logo" />
    </div>
    <nav class="sidebar-nav">
      ${links
        .map(
          (l) =>
            `<a href="#${l.path}" class="sidebar-link ${isActive(l.path) ? 'active' : ''}"><span class="sidebar-icon">${l.icon}</span>${l.label}</a>`
        )
        .join('')}
    </nav>
    <div class="sidebar-footer">
      <div class="notif-wrapper">
        <button class="sidebar-link notif-bell-link" id="notif-bell" aria-label="Notifications">
          <span class="sidebar-icon">🔔</span>Notifications
          <span class="notif-badge" id="notif-badge" style="display:none;"></span>
        </button>
        <div class="notif-dropdown" id="notif-dropdown" style="display:none;"></div>
      </div>
      <div class="user-chip">
        <span class="user-nom">${escapeHtml(user.nom)}</span>
        <span class="badge badge-neutral">${ROLE_LABELS[user.role] || user.role}</span>
      </div>
      <button class="btn btn-ghost btn-sm sidebar-logout" id="logout-btn">Déconnexion</button>
    </div>
  `;

  updateBellBadge();
  renderNotifDropdown();

  document.getElementById('notif-bell').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    if (dropdownOpen) refreshNotifications().then(renderNotifDropdown);
    document.getElementById('notif-dropdown').style.display = dropdownOpen ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    if (dropdownOpen) {
      dropdownOpen = false;
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
    location.hash = '#/login';
    renderNavbar();
    refresh();
  });
}

function updateBellBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = notifications.filter((n) => !n.lu).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.style.display = unread > 0 ? 'flex' : 'none';
}

function renderNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = `
    <div class="notif-header">
      <span>Notifications</span>
      ${notifications.some((n) => !n.lu) ? '<button class="notif-mark-all" id="notif-mark-all">Tout marquer lu</button>' : ''}
    </div>
    <div class="notif-list">
      ${
        notifications.length
          ? notifications
              .slice(0, 20)
              .map(
                (n) => `
            <a href="${n.lien ? escapeHtml(n.lien) : '#'}" class="notif-item ${n.lu ? '' : 'notif-unread'}" data-id="${n.id}">
              <span class="notif-message">${escapeHtml(n.message)}</span>
              <span class="notif-date">${formatDate(n.created_at)}</span>
            </a>
          `
              )
              .join('')
          : '<p class="notif-empty">Aucune notification.</p>'
      }
    </div>
  `;

  dropdown.querySelectorAll('.notif-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      try {
        await api.marquerNotificationLue(id);
        const notif = notifications.find((n) => n.id === id);
        if (notif) notif.lu = true;
        updateBellBadge();
      } catch {
        /* silencieux */
      }
    });
  });

  const markAllBtn = document.getElementById('notif-mark-all');
  markAllBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await api.marquerToutesNotificationsLues();
    notifications = notifications.map((n) => ({ ...n, lu: true }));
    renderNotifDropdown();
    updateBellBadge();
  });
}
