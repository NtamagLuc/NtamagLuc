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

// Peut créer/modifier/supprimer des centrales et des actifs (référentiel), gérer les utilisateurs.
export function canManageReferentiel() {
  return hasRole('ADMINISTRATEUR');
}

// Peut créer des demandes de retrait / déplacement / décommissionnement / remise en service.
export function canCreateDemande() {
  return hasRole('ADMINISTRATEUR', 'RESPONSABLE_MECANIQUE');
}

// Peut vérifier la pertinence d'une demande (2e étape) : rejeter ou transmettre au Chef Centrale.
export function canReviewExploitation() {
  return hasRole('ADMINISTRATEUR', 'RESPONSABLE_EXPLOITATION');
}

// Peut donner l'approbation finale (= exécution immédiate) d'une demande transmise.
export function canApprouverFinal() {
  return hasRole('ADMINISTRATEUR', 'CHEF_CENTRALE');
}

// Peut réaliser les actions opérationnelles directes (maintenance/réparation).
export function canOperateDirect() {
  return hasRole('ADMINISTRATEUR', 'CHEF_CENTRALE');
}

export function centraleScopeId() {
  return currentUser?.role === 'CHEF_CENTRALE' ? currentUser.centrale_id : null;
}
