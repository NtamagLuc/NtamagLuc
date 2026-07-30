import { api } from '../api.js';
import { getCurrentUser, logout, isAdmin, canValidate } from '../auth.js';
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
  const root = document.getElementById('topbar-root');
  const user = getCurrentUser();

  if (!user) {
    root.innerHTML = '';
    return;
  }

  await refreshNotifications();
  startPolling();

  const links = [
    { path: '/', label: 'Tableau de bord' },
    { path: '/demandes', label: 'Demandes' },
    { path: '/historique', label: 'Historique' },
    { path: '/reporting', label: 'Reporting' },
  ];
  if (isAdmin()) links.push({ path: '/utilisateurs', label: 'Utilisateurs' });

  root.innerHTML = `
    <div class="topbar">
      <a class="brand" href="#/">⚡ Gestion des actifs de centrales</a>
      <nav class="topnav">
        ${links
          .map((l) => `<a href="#${l.path}" class="${isActive(l.path) ? 'active' : ''}">${l.label}</a>`)
          .join('')}
      </nav>
      <div class="topbar-right">
        <div class="notif-wrapper">
          <button class="notif-bell" id="notif-bell" aria-label="Notifications">
            🔔
            <span class="notif-badge" id="notif-badge" style="display:none;"></span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown" style="display:none;"></div>
        </div>
        <div class="user-chip">
          <span class="user-nom">${escapeHtml(user.nom)}</span>
          <span class="badge badge-neutral">${ROLE_LABELS[user.role] || user.role}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Déconnexion</button>
      </div>
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
