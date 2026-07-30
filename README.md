# SOCAD'EL — Gestion des actifs industriels

Application web de gestion des actifs industriels du parc de centrales de
production d'électricité de la **Société Camerounaise d'Electricité
(SOCAD'EL)** : centrales, unités de production, équipements, actifs et
sous-actifs organisés en hiérarchie, avec suivi de leur localisation, leur
état, leur puissance et leur historique complet.

Les opérations critiques — **retrait du service**, **déplacement entre
centrales**, **décommissionnement définitif** et **remise en service** —
suivent toutes le même principe fondamental : **demande → simulation
obligatoire de l'impact → vérification par l'Exploitation → approbation du
Chef Centrale (= exécution immédiate) → recalcul des performances →
historisation → notification**. Aucune de ces opérations ne modifie l'état
réel d'un actif avant qu'une simulation ait été calculée et que le circuit
de décision à deux niveaux ait été respecté.

## Aperçu fonctionnel

| Fonction | Description |
|---|---|
| **Authentification** | Connexion par email/mot de passe, session par cookie sécurisé, vérification du statut actif du compte. 4 rôles avec permissions différenciées. |
| **Cloisonnement par centrale** | Un Chef Centrale ne voit et n'agit que sur **sa** centrale (tableau de bord, actifs, demandes, reporting). Seul l'Administrateur a une vue globale sur l'ensemble du parc. |
| **Gestion des centrales** | Création/modification avec code unique, type, localisation, puissance installée, seuil d'alerte, statut — Administrateur uniquement. Chaque centrale expose sa **puissance installée**, sa **puissance disponible** et sa **disponibilité (%)**. |
| **Tableau de bord par centrale** | Vue analytique complète (page centrale) : identité, KPI (puissance installée/disponible/indisponible, disponibilité, taux d'utilisation, production estimée réelle/prévue et écart), répartition des actifs par statut et par cause d'indisponibilité (cliquable), actifs critiques, unités de production, hiérarchie des équipements, résumé maintenance, opérations en cours, simulation d'impact interactive, alertes cliquables, évolution de la disponibilité par période (jour/semaine/mois/trimestre/année, reconstruite à partir des mouvements réellement enregistrés), timeline des événements et contribution au parc. |
| **Gestion des actifs** | Fiche complète : code unique, désignation, type, fabricant, modèle, numéro de série, date de mise en service, criticité, centrale d'affectation — Administrateur uniquement. |
| **Hiérarchie actif mère / actifs enfants** | Profondeur illimitée (ex : Centrale → Unité de production → Groupe de production → Turbine → Générateur/Capteur), avec navigation par fil d'Ariane et détection des boucles interdite. |
| **Import / export CSV** | Centrales, actifs (avec relations mère/fils via `parent_code`) et utilisateurs (avec centrale via `centrale_code`) sont importables et exportables en CSV UTF-8 — Administrateur uniquement. |
| **Retrait du service** | Demande de retrait d'un actif en service/maintenance/réparation → statut cible `HORS_SERVICE`. |
| **Déplacement entre centrales** | Demande de déplacement avec choix : actif seul ou avec toute sa hiérarchie. |
| **Décommissionnement** | Demande avec état cible au choix : `DECOMMISSIONNE` ou `REFORME` — définitif, aucune remise en service possible ensuite. L'actif n'est jamais supprimé physiquement (traçabilité). |
| **Remise en service** | Demande de remise en service d'un actif hors service, avec simulation de l'impact positif sur la centrale. |
| **Simulation obligatoire** | Pour les 4 types de demande : situation actuelle vs. situation simulée (puissance, disponibilité), sur la centrale source **et** la centrale destination pour un déplacement, avec impact consolidé sur le parc. Calculée dans un scénario virtuel, sans jamais modifier les données réelles. |
| **Niveaux d'impact configurables** | Chaque simulation est classée Faible / Moyen / Important / Critique selon des seuils réglables par l'Administrateur. **Une demande à impact critique exige l'approbation finale d'un Administrateur**, même si elle concerne la centrale d'un Chef Centrale. |
| **Détection de simulation obsolète** | Avant transmission et avant approbation finale, le système recompare la situation actuelle à celle utilisée pour la simulation. En cas d'écart, l'étape est bloquée et une nouvelle simulation doit être relancée. |
| **Circuit de décision à deux niveaux** | Le Responsable Exploitation vérifie la pertinence de toute demande créée par le Responsable Mécanique, puis la transmet (ou la rejette avec motif) ; le Chef Centrale de la centrale concernée (ou l'Administrateur si impact critique) l'approuve — ce qui **exécute la demande immédiatement** — ou la rejette avec motif. |
| **Annulation** | Une demande non exécutée (en attente ou transmise) peut être annulée par son auteur ou un administrateur, avec motif obligatoire. |
| **Recalcul des performances** | Toujours calculé en direct à partir de l'état courant des actifs (actif, unité, centrale, parc) — jamais de valeur mise en cache. |
| **Historisation** | Chaque opération conserve l'auteur, la date, l'ancienne et la nouvelle valeur, le motif, la simulation associée et les deux décisions (Exploitation puis Chef Centrale). Rien n'est supprimable par un utilisateur standard. |
| **Audit** | Recherche/filtrage des événements par centrale, actif, utilisateur, période, type d'opération — Administrateur uniquement. |
| **Notifications** | Centre in-app (cloche, badge, marquage lu) : nouvelle demande à vérifier, demande transmise à approuver, simulation obsolète, demande rejetée/exécutée. |
| **Reporting / Power BI** | Tableau de bord analytique in-app (scopé à la centrale pour un Chef Centrale) + export CSV UTF-8 par entité (centrales, actifs, mouvements, demandes), importable dans Power BI Desktop ou Excel. |
| **Gestion des utilisateurs** | Création, modification, **suppression**, import et export CSV des utilisateurs — Administrateur uniquement. Un Chef Centrale est obligatoirement rattaché à une centrale. |

### Le circuit d'une demande

```
Responsable Mécanique (ou Administrateur)
        │  sélectionne un actif + type de demande (retrait / déplacement / décommissionnement / remise en service)
        ▼
   simulation automatique obligatoire (situation avant/après, niveau d'impact)
        ▼
   EN_ATTENTE
        │
        ├─ Responsable Exploitation → Transmettre
        │        │  (vérification de fraîcheur de la simulation avant transmission)
        │        ▼
        │     TRANSMISE
        │        │
        │        ├─ Chef Centrale de la centrale concernée
        │        │  (ou Administrateur si impact CRITIQUE) → Approuver
        │        │        │  (vérification de fraîcheur de la simulation)
        │        │        ▼
        │        │     EXECUTEE  (approuver = exécuter immédiatement :
        │        │                état réel modifié, performances recalculées,
        │        │                mouvement + audit journalisés, notification de l'auteur)
        │        │
        │        └─ Chef Centrale/Administrateur → Rejeter (motif requis) ──► REJETEE
        │
        ├─ Responsable Exploitation → Rejeter (motif requis) ──► REJETEE (retour au Mécanique)
        └─ Auteur/Administrateur → Annuler (motif requis, avant exécution) ──► ANNULEE
```

Un actif mère concerné par une opération entraîne automatiquement ses
actifs enfants (cascade) ; pour un déplacement, l'utilisateur choisit
explicitement de déplacer l'actif seul ou avec toute sa hiérarchie.

### États d'un actif

`EN_SERVICE` · `EN_MAINTENANCE` · `EN_REPARATION` · `HORS_SERVICE` ·
`DECOMMISSIONNE` · `REFORME` (états terminaux).

Seul l'état `EN_SERVICE` compte dans le calcul de la **puissance
disponible** d'une centrale ; un actif en maintenance ou en réparation
n'y contribue pas.

### Rôles et permissions

| Action | Resp. Mécanique | Resp. Exploitation | Chef Centrale | Administrateur |
|---|:---:|:---:|:---:|:---:|
| Consultation de sa/ses centrale(s), reporting | ✅ (tout le parc) | ✅ (tout le parc) | ✅ (sa centrale uniquement) | ✅ (tout le parc) |
| Créer/modifier/importer/exporter centrales et actifs | ❌ | ❌ | ❌ | ✅ |
| Créer une demande | ✅ | ❌ | ❌ | ✅ |
| Vérifier et transmettre / rejeter une demande | ❌ | ✅ | ❌ | ✅ |
| Approuver (= exécuter) / rejeter une demande transmise | ❌ | ❌ | ✅ (sa centrale) | ✅ |
| Approuver une demande à impact **critique** | ❌ | ❌ | ❌ | ✅ |
| Annuler sa propre demande | ✅ (auteur) | ❌ | ❌ | ✅ |
| Mise en maintenance / réparation directe | ❌ | ❌ | ✅ (sa centrale) | ✅ |
| Gestion, import/export et suppression des utilisateurs | ❌ | ❌ | ❌ | ✅ |
| Paramètres d'impact | ❌ | ❌ | ❌ | ✅ |
| Journal d'audit | ❌ | ❌ | ❌ | ✅ |

### Comptes de démonstration

| Rôle | Email | Mot de passe | Centrale |
|---|---|---|---|
| Administrateur | `admin@centrale.local` | `admin123` | toutes |
| Responsable Mécanique | `mecanique@centrale.local` | `mecanique123` | toutes (créateur de demandes) |
| Responsable Exploitation | `exploitation@centrale.local` | `exploitation123` | toutes (vérificateur) |
| Chef Centrale — Douala | `chef.douala@centrale.local` | `chefcentrale123` | Centrale Thermique de Douala |
| Chef Centrale — Song Loulou | `chef.songloulou@centrale.local` | `chefcentrale123` | Barrage Hydroélectrique de Song Loulou |

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
- **Cloisonnement par centrale** : `centraleScopeId()` / `requireCentraleAccess()`
  (`server/src/lib/auth.js`) filtrent chaque route consultée ou modifiée par
  un Chef Centrale à sa seule centrale (`centrale_id` sur l'utilisateur).
- **Transactions** : l'approbation d'une demande (changement d'état +
  journalisation + mise à jour du statut) est enveloppée dans une
  transaction SQLite (`withTransaction` dans `db.js`) : aucune opération
  n'est partiellement appliquée en cas d'échec.
- **Import/export CSV** : parseur et writer RFC4180 maison
  (`server/src/lib/csv.js`), sans dépendance externe, avec BOM UTF-8 pour
  Excel.
- **Base de données** : SQLite via `node:sqlite`
  (`server/data/`, créée et peuplée automatiquement).
- **Frontend** : JavaScript vanilla (ES modules), sans framework ni build
  — routeur par hash, garde d'authentification et **sidebar** de
  navigation dynamique par rôle, aux couleurs SOCAD'EL. Servi en fichiers
  statiques par le même serveur Node.

```
NtamagLuc/
├── server/src/
│   ├── db.js                          # schéma SQLite + seed (centrales, actifs, 4 rôles)
│   ├── index.js                       # point d'entrée HTTP (API + fichiers statiques)
│   ├── lib/
│   │   ├── miniweb.js                 # mini-framework HTTP (routage, JSON, CORS)
│   │   ├── auth.js                    # sessions, cookies, garde d'accès par rôle + par centrale
│   │   ├── password.js, csv.js, notifications.js, audit.js
│   ├── routes/                        # auth, utilisateurs, centrales, actifs, demandes,
│   │                                  # mouvements, notifications, reporting, audit, parametres
│   └── services/
│       ├── performance.js             # simulation, niveaux d'impact, puissance/disponibilité
│       └── mouvements.js              # journalisation des mouvements exécutés
└── client/public/
    ├── index.html, css/styles.css, assets/socadel-logo.jpeg
    └── js/
        ├── api.js, auth.js, router.js, app.js, utils.js
        ├── components/                # sidebar (navbar.js), modal, gauge, actifTree, demandeFormModal…
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
| GET/POST/PUT/DELETE | `/api/utilisateurs` | Gestion des utilisateurs (Administrateur) |
| GET/POST | `/api/utilisateurs/export`, `/import` | Import/export CSV des utilisateurs |
| GET/POST/PUT/DELETE | `/api/centrales` | Centrales (scopées par centrale pour un Chef Centrale) |
| GET/POST | `/api/centrales/export`, `/import` | Import/export CSV des centrales |
| GET | `/api/centrales/:id/dashboard?periode=` | Tableau de bord agrégé de la centrale (KPI, causes, alertes, historique, timeline, contribution au parc) |
| GET/POST/PUT/DELETE | `/api/actifs` | Actifs (scopés par centrale pour un Chef Centrale) |
| GET/POST | `/api/actifs/export`, `/import` | Import/export CSV des actifs (avec `parent_code`) |
| POST | `/api/actifs/:id/mettre-en-maintenance`, `/fin-maintenance`, `/mettre-en-reparation`, `/fin-reparation` | Actions opérationnelles directes (Chef Centrale de la centrale, Administrateur) |
| GET/POST | `/api/demandes`, `/api/demandes/preview` | Liste / création / simulation à la volée |
| POST | `/api/demandes/:id/transmettre`, `/rejeter-exploitation` | Étape 1 : vérification par l'Exploitation |
| POST | `/api/demandes/:id/approuver`, `/rejeter` | Étape 2 : approbation (= exécution) par le Chef Centrale |
| POST | `/api/demandes/:id/annuler`, `/relancer-simulation` | Annulation / relance de simulation obsolète |
| GET | `/api/mouvements` | Historique des mouvements exécutés |
| GET | `/api/audit-log` | Journal d'audit filtrable (Administrateur) |
| GET/POST | `/api/notifications`, `/:id/lu`, `/lu-tout` | Centre de notifications |
| GET/PUT | `/api/parametres/impact` | Seuils de classification du niveau d'impact (Administrateur) |
| GET | `/api/reporting/summary` | Indicateurs agrégés (scopés par centrale pour un Chef Centrale) |
| GET | `/api/reporting/export/:entity` | Export CSV (`centrales`, `actifs`, `mouvements`, `demandes`) |

## Simplifications assumées

Vu l'ampleur du cahier des charges, quelques choix pragmatiques ont été
faits, documentés ici pour transparence :

- Le déplacement propose un choix binaire (actif seul / avec toute sa
  hiérarchie), pas la sélection fine d'un sous-ensemble d'actifs enfants.
- La détection de simulation obsolète compare la performance "avant"
  (et, pour un déplacement, la situation de la centrale destination) au
  moment de la transmission/approbation à celle du calcul initial ; elle
  ne rejoue pas une comparaison champ par champ de tous les attributs.
- L'import CSV se fait en collant/chargeant un fichier `.csv` lu côté
  navigateur (`FileReader`) puis envoyé en JSON ; il n'y a pas d'upload
  multipart natif (contrainte zéro-dépendance).
- Un Responsable Mécanique et un Responsable Exploitation ne sont pas
  rattachés à une centrale : ils opèrent sur l'ensemble du parc (seul le
  rôle Chef Centrale est cloisonné, conformément à la demande).
- La **production (MWh)** affichée dans le tableau de bord centrale est une
  **estimation** calculée en intégrant, dans le temps, la puissance
  disponible réellement enregistrée (reconstruite à partir des mouvements
  historisés) — l'application ne reçoit aucune télérelève de production
  réelle. La « production prévue » est calculée à partir du seuil de
  disponibilité cible configuré sur la centrale. Le « rendement » n'est pas
  affiché (aucune donnée de combustible/débit mesurée dans ce périmètre).
  Tant qu'aucun mouvement n'a eu lieu sur une centrale, l'évolution
  historique affiche la valeur courante reportée sur toute la période — la
  page l'indique explicitement.
- La puissance installée déclarée d'une centrale (champ configuré par
  l'Administrateur) peut différer de la somme des contributions de ses
  actifs enregistrés ; le tableau de bord signale cet écart séparément
  (« Écart capacité nominale ») plutôt que de l'attribuer à tort à une
  cause d'indisponibilité.

## Tests effectués

Scénarios validés de bout en bout (Playwright, navigateur réel + curl),
sur les 4 rôles : connexion et rendu de la sidebar (logo SOCAD'EL, liens
filtrés par rôle), création d'une demande de retrait par le Responsable
Mécanique, vérification et transmission par le Responsable Exploitation,
approbation = exécution immédiate par le Chef Centrale de la centrale
concernée, rejet au stade Exploitation (retour au Mécanique) et rejet au
stade Chef Centrale, escalade d'une demande à impact **critique** vers
l'Administrateur (Chef Centrale bloqué en 403), cloisonnement d'un Chef
Centrale à sa seule centrale sur le tableau de bord/demandes/reporting
(vérifié avec deux Chefs Centrale distincts), accès refusé (403) sur les
pages réservées à l'Administrateur, import/export CSV des centrales, des
actifs (avec relations mère/fils via `parent_code`) et des utilisateurs
(avec `centrale_code`), suppression d'un utilisateur, reporting scopé par
centrale.
