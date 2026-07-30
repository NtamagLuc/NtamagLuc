# Gestion de retrait des actifs de centrales de production d'électricité

Application de **gestion de demandes de retrait, de déplacement et de
réforme d'actifs** dans un parc de centrales de production d'électricité,
avec circuit complet demande → simulation → validation → exécution,
authentification par rôles, notifications, audit et reporting.

## Aperçu fonctionnel

| Fonction | Description |
|---|---|
| **Authentification** | Connexion par email/mot de passe, session par cookie. 3 rôles : Demandeur, Validateur, Administrateur. |
| **Création centrale** | Centrales de production (nom, type, localisation, capacité nominale, seuil d'alerte) — Administrateur. |
| **Gestion actifs** | Création/modification/suppression d'actifs rattachés à une centrale — Administrateur. |
| **Hiérarchie mère/enfant** | Un actif peut avoir des actifs enfants (ex : turbine → générateur, capteurs), affichés en arbre. |
| **Consultation parc** | Tableau de bord des centrales, détail par centrale, détail par actif — tous les rôles. |
| **Retrait actif / Déplacement actif / Réforme actif** | Trois types de **demandes** soumises par un Demandeur, Validateur ou Administrateur. |
| **Simulation retrait / déplacement / réforme** | Impact chiffré (score de performance avant/après) + alertes contextuelles, calculé à la création de la demande et recalculé en direct à la consultation. |
| **Validation retrait / déplacement / réforme** | Un Validateur (ou Administrateur) approuve ou rejette (motif obligatoire) une demande en attente. |
| **Exécution retrait / déplacement / réforme** | Une fois validée, un Validateur/Administrateur déclenche l'exécution effective (modification des actifs, recalcul des performances). |
| **Recalcul performances** | Le score de performance de chaque centrale est **toujours recalculé en direct** à partir de l'état courant des actifs (aucun cache). |
| **Historique / audit** | Journal des mouvements exécutés (impact chiffré) + journal d'audit complet (créations, validations, rejets, connexions…) — Validateur/Administrateur. |
| **Notifications** | Centre de notifications in-app (cloche, badge non-lus, marquage lu) : nouvelle demande à valider, demande validée/rejetée/exécutée. |
| **Maintenance / Remise en service** | Actions opérationnelles directes (hors circuit de demande) réservées au Validateur/Administrateur : mise en maintenance, fin de maintenance, remise en service d'un actif retiré. |
| **Réforme / décommissionnement** | Statut terminal `REFORME` : suit le même circuit demande → simulation → validation → exécution que le retrait, mais est définitif (aucune remise en service possible ensuite). |
| **Power BI / reporting** | Tableau de bord analytique in-app (jauges, graphiques) + export CSV UTF-8 par entité, importable dans Power BI Desktop ou Excel. |

### Le circuit de demande

```
Demandeur / Validateur / Administrateur
        │  crée une demande (retrait, déplacement ou réforme)
        ▼
   EN_ATTENTE  ──simulation calculée automatiquement (score avant/après, alertes)
        │
        ├─ Validateur/Administrateur → Valider ──► VALIDEE ──► Exécuter ──► EXECUTEE
        │                                                                  (actifs modifiés,
        │                                                                   performances recalculées,
        │                                                                   mouvement journalisé)
        ├─ Validateur/Administrateur → Rejeter (motif requis) ──► REJETEE
        └─ Auteur/Administrateur → Annuler ──► ANNULEE
```

Un actif mère déplacé/retiré/réformé entraîne automatiquement ses actifs
enfants (cascade), et la simulation liste les actifs impactés.

### Rôles et permissions

| Action | Demandeur | Validateur | Administrateur |
|---|:---:|:---:|:---:|
| Consultation (centrales, actifs, reporting) | ✅ | ✅ | ✅ |
| Créer une centrale / gérer les actifs | ❌ | ❌ | ✅ |
| Créer une demande (retrait/déplacement/réforme) | ✅ | ✅ | ✅ |
| Valider / rejeter une demande | ❌ | ✅ | ✅ |
| Exécuter une demande validée | ❌ | ✅ | ✅ |
| Annuler sa propre demande en attente | ✅ | ✅ (si auteur) | ✅ |
| Mettre en maintenance / fin de maintenance / remise en service | ❌ | ✅ | ✅ |
| Gestion des utilisateurs | ❌ | ❌ | ✅ |
| Journal d'audit | ❌ | ✅ | ✅ |

### Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@centrale.local` | `admin123` |
| Validateur | `validateur@centrale.local` | `validateur123` |
| Demandeur | `demandeur@centrale.local` | `demandeur123` |

> Comptes créés automatiquement au premier démarrage. À changer avant tout
> déploiement réel (voir page Utilisateurs, Administrateur uniquement).

## Architecture technique

> ⚠️ **Contrainte d'environnement** : l'accès au registre npm (et à tout
> CDN externe) est bloqué dans le sandbox d'exécution utilisé pour
> développer cette application — `npm install` renvoie une erreur 403.
> L'application a donc été construite **sans aucune dépendance externe**,
> avec uniquement les modules natifs de Node.js.

- **Backend** : Node.js pur (`node:http` + `node:sqlite`, natif depuis
  Node 22). Un mini-framework façon Express (`server/src/lib/miniweb.js`)
  fournit le routage, le parsing JSON et le CORS.
- **Authentification** : mots de passe hashés avec `scrypt` (`node:crypto`),
  sessions stockées en base et cookie `HttpOnly` (`server/src/lib/auth.js`).
- **Base de données** : SQLite via le module natif `node:sqlite`
  (fichier `server/data/retrait-actifs.sqlite`, créé et peuplé
  automatiquement au premier démarrage).
- **Frontend** : JavaScript vanilla (ES modules), sans framework ni étape
  de build — routeur par hash (`client/public/js/router.js`), garde
  d'authentification et navbar dynamique. Servi en fichiers statiques par
  le même serveur Node.

```
gestion-retrait-actifs/
├── server/
│   ├── src/
│   │   ├── db.js                      # schéma SQLite + seed (centrales, actifs, utilisateurs)
│   │   ├── index.js                   # point d'entrée HTTP (API + fichiers statiques)
│   │   ├── lib/
│   │   │   ├── miniweb.js             # mini-framework HTTP (routage, JSON, CORS)
│   │   │   ├── auth.js                # sessions, cookies, garde d'accès par rôle
│   │   │   ├── password.js            # hash/vérification scrypt
│   │   │   ├── notifications.js       # création de notifications (utilisateur ou rôle)
│   │   │   ├── audit.js               # journalisation d'audit
│   │   │   └── csv.js                 # export CSV (BOM UTF-8, échappement)
│   │   ├── routes/                    # auth, utilisateurs, centrales, actifs, demandes,
│   │   │                              # mouvements, notifications, reporting, audit
│   │   └── services/
│   │       ├── performance.js         # calcul du score + simulation + alertes
│   │       └── mouvements.js          # journalisation des mouvements exécutés
│   └── data/                          # fichier SQLite (généré, ignoré par git)
└── client/
    └── public/
        ├── index.html
        ├── css/styles.css
        └── js/
            ├── api.js, auth.js, router.js, app.js, utils.js
            ├── components/            # navbar, modal, gauge, actifTree, demandeFormModal…
            └── pages/                 # login, dashboard, centrale, actif, demandes,
                                        # demandeDetail, historique, reporting, utilisateurs
```

## Lancer l'application

Prérequis : Node.js ≥ 22 (pour `node:sqlite`).

```bash
node server/src/index.js
# ou, depuis la racine :
npm start
```

Puis ouvrir http://localhost:4000 et se connecter avec l'un des comptes de
démonstration ci-dessus. Le port peut être changé via `PORT`.

## API REST (principales routes)

| Méthode | Route | Description |
|--------|--------|-------------|
| POST | `/api/auth/login`, `/api/auth/logout` | Connexion / déconnexion |
| GET | `/api/auth/me` | Utilisateur courant |
| GET/POST/PUT | `/api/utilisateurs` | Gestion des utilisateurs (Administrateur) |
| GET/POST/PUT/DELETE | `/api/centrales` | Centrales |
| GET/POST/PUT/DELETE | `/api/actifs` | Actifs |
| POST | `/api/actifs/:id/mettre-en-maintenance`, `/fin-maintenance`, `/remise-en-service` | Actions directes |
| GET/POST | `/api/demandes`, `/api/demandes/preview` | Liste / création / simulation à la volée |
| POST | `/api/demandes/:id/valider`, `/rejeter`, `/executer`, `/annuler` | Cycle de vie d'une demande |
| GET | `/api/mouvements` | Historique des mouvements exécutés |
| GET | `/api/audit-log` | Journal d'audit (Validateur/Administrateur) |
| GET/POST | `/api/notifications`, `/:id/lu`, `/lu-tout` | Centre de notifications |
| GET | `/api/reporting/summary` | Indicateurs agrégés |
| GET | `/api/reporting/export/:entity` | Export CSV (`centrales`, `actifs`, `mouvements`, `demandes`) |

## Tests effectués

Scénarios validés de bout en bout (Playwright, navigateur réel) :
connexion des 3 rôles, création d'une demande de retrait avec simulation,
notification du Validateur, validation puis exécution, recalcul de
performance, rejet avec motif, annulation par le demandeur, réforme
définitive (avec blocage de la remise en service ensuite), actions de
maintenance directes, accès refusé (403) sur les pages réservées,
redirection vers la connexion pour un utilisateur non authentifié,
reporting et export CSV.
