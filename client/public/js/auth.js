import { api } from './api.js';

let currentUser = null;
let loaded = false;

export function getCurrentUser() {
  return currentUser;
}

export async function loadCurrentUser() {
  try {
    currentUser = await api.me();
  } catch {
    currentUser = null;
  }
  loaded = true;
  return currentUser;
}

export function isLoaded() {
  return loaded;
}

export async function login(email, password) {
  currentUser = await api.login(email, password);
  loaded = true;
  return currentUser;
}

export async function logout() {
  await api.logout();
  currentUser = null;
}

export function hasRole(...roles) {
  return !!currentUser && roles.includes(currentUser.role);
}

export function isAdmin() {
  return hasRole('ADMINISTRATEUR');
}

// Peut créer/modifier/supprimer des centrales et des actifs (référentiel).
export function canManageReferentiel() {
  return hasRole('ADMINISTRATEUR', 'GESTIONNAIRE_ACTIFS');
}

// Peut créer des demandes de retrait / déplacement / décommissionnement / remise en service.
export function canCreateDemande() {
  return hasRole('ADMINISTRATEUR', 'GESTIONNAIRE_ACTIFS', 'RESPONSABLE_CENTRALE', 'RESPONSABLE_PRODUCTION', 'VALIDATEUR');
}

// Peut approuver/rejeter une demande.
export function canValidate() {
  return hasRole('ADMINISTRATEUR', 'VALIDATEUR');
}

// Peut exécuter une demande approuvée.
export function canExecute() {
  return hasRole('ADMINISTRATEUR', 'VALIDATEUR', 'GESTIONNAIRE_ACTIFS');
}

// Peut réaliser les actions opérationnelles directes (maintenance/réparation).
export function canOperateDirect() {
  return hasRole('ADMINISTRATEUR', 'GESTIONNAIRE_ACTIFS', 'RESPONSABLE_CENTRALE');
}
