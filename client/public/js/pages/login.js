import { login } from '../auth.js';
import { renderNavbar } from '../components/navbar.js';

export async function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <img src="/assets/socadel-logo.jpeg" alt="SOCAD'EL" class="login-logo" />
        <p class="login-subtitle">Gestion des actifs industriels — Connectez-vous pour accéder à l'application.</p>
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
            <li>Responsable Mécanique : mecanique@centrale.local / mecanique123</li>
            <li>Responsable Exploitation : exploitation@centrale.local / exploitation123</li>
            <li>Chef Centrale (Douala) : chef.douala@centrale.local / chefcentrale123</li>
            <li>Chef Centrale (Song Loulou) : chef.songloulou@centrale.local / chefcentrale123</li>
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
