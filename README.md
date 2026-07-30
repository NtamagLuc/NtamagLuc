# Gestion des actifs industriels — Parc de centrales de production d'électricité

Application web complète de gestion des actifs industriels d'un parc de
centrales de production d'électricité : centrales, unités de production,
équipements, actifs et sous-actifs organisés en hiérarchie, avec suivi de
leur localisation, leur état, leur performance et leur historique complet.

Les opérations critiques — **retrait du service**, **déplacement entre
centrales**, **décommissionnement définitif** et **remise en service** —
suivent toutes le même principe fondamental : **demande → contrôles →
simulation obligatoire de l'impact → analyse → validation → vérification
finale → exécution → recalcul des performances → historisation →
notification**. Aucune de ces opérations ne modifie l'état réel d'un actif
avant qu'une simulation ait été calculée et qu'une validation ait été
obtenue.

## Aperçu fonctionnel

| Fonction | Description |
|---|---|
| **Authentification** | Connexion par email/mot de passe, session par cookie sécurisé, vérification du statut actif du compte. 6 rôles avec permissions différenciées. |
| **Gestion des centrales** | Création/modification avec code unique, type, localisation, puissance installée, statut (active/inactive) — Administrateur et Gestionnaire des actifs. |
| **Gestion des actifs** | Fiche complète : code unique, désignation, type, fabricant, modèle, numéro de série, date de mise en service, criticité, centrale d'affectation. |
| **Hiérarchie actif mère / actifs enfants** | Profondeur illimitée (ex : Centrale → Unité de production → Groupe de production → Turbine → Générateur/Capteur), avec navigation par fil d'Ariane et détection des boucles interdite. |
| **Consultation du parc** | Tableau de bord, détail par centrale, arbre hiérarchique des actifs, fiche détaillée par actif — accessible à tous les rôles authentifiés. |
| **Retrait du service** | Demande de retrait d'un actif en service/maintenance/réparation → statut cible `HORS_SERVICE`. |
| **Déplacement entre centrales** | Demande de déplacement avec choix : actif seul ou avec toute sa hiérarchie. L'actif passe par un état transitoire `EN_TRANSFERT` entre l'approbation et l'exécution. |
| **Décommissionnement** | Demande avec état cible au choix : `DECOMMISSIONNE` ou `REFORME` — définitif, aucune remise en service possible ensuite. L'actif n'est jamais supprimé physiquement (traçabilité). |
| **Remise en service** | Demande de remise en service d'un actif hors service, avec simulation de l'impact positif sur la centrale. |
| **Simulation obligatoire** | Pour les 4 types de demande : situation actuelle vs. situation simulée (puissance, disponibilité, performance), sur la centrale source **et** la centrale destination pour un déplacement, avec impact consolidé sur le parc. Calculée dans un scénario virtuel, sans jamais modifier les données réelles. |
| **Niveaux d'impact configurables** | Chaque simulation est classée Faible / Moyen / Important / Critique selon des seuils (en points de performance) réglables par l'Administrateur. **Une demande à impact critique exige la validation d'un Administrateur** (et non d'un simple Validateur). |
| **Détection de simulation obsolète** | Avant validation et avant exécution, le système recompare la situation actuelle à celle utilisée pour la simulation. En cas d'écart, l'exécution est bloquée et une nouvelle simulation doit être relancée avant toute nouvelle validation. |
| **Validation / rejet** | Un Validateur (ou Administrateur) approuve ou rejette (motif obligatoire) une demande en attente. Auto-validation interdite. |
| **Exécution** | Dernière vérification de cohérence puis application réelle : changement d'état, recalcul des performances, journalisation, notification. |
| **Annulation** | Une demande non exécutée (en attente ou déjà approuvée) peut être annulée par son auteur ou un administrateur, avec motif obligatoire. |
| **Recalcul des performances** | Toujours calculé en direct à partir de l'état courant des actifs (actif, unité, centrale, parc) — jamais de valeur mise en cache. |
| **Historisation** | Chaque opération conserve l'auteur, la date, l'ancienne et la nouvelle valeur, le motif, la simulation associée et la décision de validation. Rien n'est supprimable par un utilisateur standard. |
| **Audit** | Recherche/filtrage des événements par centrale, actif, utilisateur, période, type d'opération — Validateur/Administrateur. |
| **Notifications** | Centre in-app (cloche, badge, marquage lu) : nouvelle demande à valider, simulation obsolète, demande approuvée/rejetée/exécutée. |
| **Reporting / Power BI** | Tableau de bord analytique in-app + export CSV UTF-8 par entité (centrales, actifs, mouvements, demandes), importable dans Power BI Desktop ou Excel. |

### Le circuit d'une demande

```
Demandeur habilité (Gestionnaire, Responsable centrale/production, Validateur, Administrateur)
        │  sélectionne un actif + type de demande (retrait / déplacement / décommissionnement / remise en service)
        ▼
   simulation automatique obligatoire (situation avant/après, niveau d'impact)
        ▼
   EN_ATTENTE
        │
        ├─ Validateur (ou Administrateur si impact CRITIQUE) → Approuver
        │        │  (un déplacement approuvé passe l'actif en EN_TRANSFERT)
        │        ▼
        │     APPROUVEE ──vérification de fraîcheur de la simulation──► Exécuter ──► EXECUTEE
        │        │                                                      (état réel modifié,
        │        │  simulation devenue obsolète → blocage                performances recalculées,
        │        └─ Relancer la simulation ──► retour à EN_ATTENTE       mouvement + audit journalisés,
        │                                                                 notification de l'auteur)
        ├─ Validateur/Administrateur → Rejeter (motif requis) ──► REJETEE
        └─ Auteur/Administrateur → Annuler (motif requis, avant exécution) ──► ANNULEE
```

Un actif mère concerné par une opération entraîne automatiquement ses
actifs enfants (cascade) ; pour un déplacement, l'utilisateur choisit
explicitement de déplacer l'actif seul ou avec toute sa hiérarchie.

### États d'un actif

`EN_SERVICE` · `EN_MAINTENANCE` · `EN_REPARATION` · `EN_TRANSFERT` (pendant un
déplacement approuvé non encore exécuté) · `HORS_SERVICE` ·
`DECOMMISSIONNE` · `REFORME` (états terminaux).

### Rôles et permissions

| Action | Consultation | Resp. centrale/production | Gestionnaire actifs | Validateur | Administrateur |
|---|:---:|:---:|:---:|:---:|:---:|
| Consultation du parc, reporting | ✅ | ✅ | ✅ | ✅ | ✅ |
| Créer/modifier centrales et actifs | ❌ | ❌ | ✅ | ❌ | ✅ |
| Créer une demande | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approuver / rejeter une demande | ❌ | ❌ | ❌ | ✅ | ✅ |
| Approuver une demande à impact **critique** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Exécuter une demande approuvée | ❌ | ❌ | ✅ | ✅ | ✅ |
| Annuler sa propre demande | ❌ | ✅ (auteur) | ✅ (auteur) | ✅ (auteur) | ✅ |
| Mise en maintenance / réparation directe | ❌ | ✅ | ✅ | ❌ | ✅ |
| Gestion des utilisateurs, paramètres d'impact | ❌ | ❌ | ❌ | ❌ | ✅ |
| Journal d'audit | ❌ | ❌ | ❌ | ✅ | ✅ |

### Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@centrale.local` | `admin123` |
| Gestionnaire des actifs | `gestionnaire@centrale.local` | `gestionnaire123` |
| Responsable de centrale | `responsable.centrale@centrale.local` | `responsable123` |
| Responsable de production | `responsable.production@centrale.local` | `production123` |
| Validateur | `validateur@centrale.local` | `validateur123` |
| Utilisateur en consultation | `consultation@centrale.local` | `consultation123` |

> Comptes créés automatiquement au premier démarrage. À changer avant tout
> déploiement réel (page Utilisateurs, Administrateur uniquement).

## Architecture technique

> ⚠️ **Contrainte d'environnement** : l'accès au registre npm (et à tout
> CDN externe) est bloqué dans le sandbox utilisé pour développer cette
> application. Elle est donc construite **sans aucune dépendance
> externe**, avec uniquement les modules natifs de Node.js.

- **Backend** : Node.js pur (`node:http` + `node:sqlite`, natif depuis
  Node 22). Mini-framework façon Express (`server/src/lib/miniweb.js`)
  pour le routage, le parsing JSON et le CORS.
- **Authentification** : mots de passe hashés `scrypt` (`node:crypto`),
  sessions en base + cookie `HttpOnly` (`server/src/lib/auth.js`).
- **Transactions** : les exécutions de demandes (changement d'état +
  journalisation + mise à jour du statut) sont enveloppées dans une
  transaction SQLite (`withTransaction` dans `db.js`) : aucune opération
  n'est partiellement appliquée en cas d'échec.
- **Base de données** : SQLite via `node:sqlite`
  (`server/data/retrait-actifs.sqlite`, créée et peuplée automatiquement).
- **Frontend** : JavaScript vanilla (ES modules), sans framework ni build
  — routeur par hash, garde d'authentification et navbar dynamique par
  rôle. Servi en fichiers statiques par le même serveur Node.

```
gestion-retrait-actifs/
├── server/src/
│   ├── db.js                          # schéma SQLite + seed (centrales, actifs, 6 rôles)
│   ├── index.js                       # point d'entrée HTTP (API + fichiers statiques)
│   ├── lib/
│   │   ├── miniweb.js                 # mini-framework HTTP (routage, JSON, CORS)
│   │   ├── auth.js                    # sessions, cookies, garde d'accès par rôle
│   │   ├── password.js, csv.js, notifications.js, audit.js
│   ├── routes/                        # auth, utilisateurs, centrales, actifs, demandes,
│   │                                  # mouvements, notifications, reporting, audit, parametres
│   └── services/
│       ├── performance.js             # simulation, niveaux d'impact, calcul de performance
│       └── mouvements.js              # journalisation des mouvements exécutés
└── client/public/
    ├── index.html, css/styles.css
    └── js/
        ├── api.js, auth.js, router.js, app.js, utils.js
        ├── components/                # navbar, modal, gauge, actifTree, demandeFormModal…
        └── pages/                     # login, dashboard, centrale, actif, demandes,
                                        # demandeDetail, historique, reporting, utilisateurs, parametres
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
| POST | `/api/actifs/:id/mettre-en-maintenance`, `/fin-maintenance`, `/mettre-en-reparation`, `/fin-reparation` | Actions opérationnelles directes |
| GET/POST | `/api/demandes`, `/api/demandes/preview` | Liste / création / simulation à la volée |
| POST | `/api/demandes/:id/valider`, `/rejeter`, `/executer`, `/annuler`, `/relancer-simulation` | Cycle de vie d'une demande |
| GET | `/api/mouvements` | Historique des mouvements exécutés |
| GET | `/api/audit-log` | Journal d'audit filtrable (Validateur/Administrateur) |
| GET/POST | `/api/notifications`, `/:id/lu`, `/lu-tout` | Centre de notifications |
| GET/PUT | `/api/parametres/impact` | Seuils de classification du niveau d'impact (Administrateur) |
| GET | `/api/reporting/summary` | Indicateurs agrégés |
| GET | `/api/reporting/export/:entity` | Export CSV (`centrales`, `actifs`, `mouvements`, `demandes`) |

## Simplifications assumées

Vu l'ampleur du cahier des charges, quelques choix pragmatiques ont été
faits, documentés ici pour transparence :

- Le déplacement propose un choix binaire (actif seul / avec toute sa
  hiérarchie), pas la sélection fine d'un sous-ensemble d'actifs enfants.
- La détection de simulation obsolète compare la performance "avant"
  (et, pour un déplacement, la situation de la centrale destination) au
  moment de la validation/exécution à celle du calcul initial ; elle ne
  rejoue pas une comparaison champ par champ de tous les attributs.
- Il n'y a pas de portée de rôle "par centrale" : un Responsable de
  centrale voit et agit sur l'ensemble du parc, pas seulement sa
  centrale.

## Tests effectués

Scénarios validés de bout en bout (Playwright, navigateur réel), sur les
6 rôles : connexion, hiérarchie sur 4 niveaux, création d'une demande de
retrait avec cascade sur 7 actifs enfants et classification d'impact
CRITIQUE, blocage de la validation par un simple Validateur (escalade
Administrateur), approbation puis exécution, remise en service,
déplacement avec état transitoire `EN_TRANSFERT` et recalcul correct des
deux centrales, rejet avec motif, annulation, décommissionnement
définitif (avec blocage de la remise en service ensuite), actions de
maintenance directes, accès refusés (403) sur les pages réservées,
reporting, paramètres d'impact et export CSV enrichi.
