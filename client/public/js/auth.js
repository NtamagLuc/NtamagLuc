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

export function canValidate() {
  return hasRole('VALIDATEUR', 'ADMINISTRATEUR');
}
