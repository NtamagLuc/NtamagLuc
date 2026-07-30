import { login } from '../auth.js';
import { renderNavbar } from '../components/navbar.js';

export async function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <h1>⚡ Gestion des actifs de centrales</h1>
        <p class="login-subtitle">Connectez-vous pour accéder à l'application.</p>
        <form id="login-form">
          <label class="field">
            <span>Email</span>
            <input type="email" name="email" required autofocus placeholder="prenom@centrale.local" />
          </label>
          <label class="field">
            <span>Mot de passe</span>
            <input type="password" name="password" required />
          </label>
          <div id="login-error" class="error-state" style="display:none;"></div>
          <button type="submit" class="btn btn-primary login-submit">Se connecter</button>
        </form>
        <div class="login-hint">
          <p><strong>Comptes de démonstration</strong></p>
          <ul>
            <li>Administrateur : admin@centrale.local / admin123</li>
            <li>Validateur : validateur@centrale.local / validateur123</li>
            <li>Demandeur : demandeur@centrale.local / demandeur123</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorBox = document.getElementById('login-error');
    errorBox.style.display = 'none';
    try {
      await login(fd.get('email'), fd.get('password'));
      renderNavbar();
      location.hash = '#/';
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    }
  });
}
