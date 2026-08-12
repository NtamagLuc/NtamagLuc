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
| **Cloisonnement par centrale** | Le Chef Centrale, le Responsable Mécanique et le Responsable Exploitation sont chacun rattachés à **une seule centrale** et ne voient/n'agissent que sur celle-ci (tableau de bord, actifs, demandes, reporting, mouvements). Seul l'Administrateur a une vue globale sur l'ensemble du parc. |
| **Gestion des centrales** | Page dédiée **Centrales** (menu latéral, Administrateur uniquement) : tableau de toutes les centrales avec création, modification et suppression, code unique, type, localisation, **région électrique** (référentiel des 9 régions SOCAD'EL : DRO, DRY, DRNEA, DRONO, DRSOM, DRC, DRE, DRSANO, DRSM), puissance installée, seuil d'alerte, statut, import/export CSV/Excel. Le Tableau de bord n'affiche plus que la vue d'ensemble en lecture seule (cartes cliquables vers la fiche analytique de chaque centrale). |
| **Tableau de bord par centrale** | Vue analytique en lecture seule (page centrale) : identité, KPI (puissance installée/disponible/indisponible, disponibilité, taux d'utilisation, production estimée réelle/prévue et écart), répartition des actifs par statut et par cause d'indisponibilité (cliquable), actifs critiques, unités de production, équipements de premier niveau, résumé maintenance, opérations en cours, simulation d'impact interactive, alertes cliquables, évolution de la disponibilité par période (jour/semaine/mois/trimestre/année, reconstruite à partir des mouvements réellement enregistrés), timeline des événements et contribution au parc. La création/modification/suppression de la centrale ou de ses actifs se fait depuis les pages **Centrales** et **Actifs** dédiées. |
| **Gestion des actifs** | Page dédiée **Actifs** (menu latéral, Administrateur uniquement) : sélection d'une centrale, puis tableau de ses actifs (code, nom, type, actif mère, statut, criticité, contribution) avec création, modification et suppression, import/export CSV/Excel. Fiche complète : code unique (immuable après création), désignation, type, fabricant, modèle, numéro de série, date de mise en service, criticité. |
| **Hiérarchie actif mère / actifs enfants** | Profondeur illimitée (ex : Centrale → Unité de production → Groupe de production → Turbine → Générateur/Capteur), avec navigation par fil d'Ariane et détection des boucles interdite. Le tableau de bord d'une centrale n'affiche que les **actifs de premier niveau** (avec un badge « N sous-actif(s) ») ; les actifs enfants n'apparaissent qu'en ouvrant le détail de leur actif mère. |
| **Import / export CSV et Excel** | Centrales, actifs (avec relations mère/fils via `parent_code`) et utilisateurs (avec centrale via `centrale_code`) sont importables depuis un fichier **CSV ou Excel (.xlsx)**, et exportables en CSV UTF-8 — Administrateur uniquement. |
| **Retrait du service** | Demande de retrait d'un actif en service/maintenance/réparation → statut cible `HORS_SERVICE`. |
| **Déplacement entre centrales** | Demande de déplacement avec choix : actif seul ou avec toute sa hiérarchie. |
| **Décommissionnement** | Demande avec état cible au choix : `DECOMMISSIONNE` ou `REFORME` — définitif, aucune remise en service possible ensuite. L'actif n'est jamais supprimé physiquement (traçabilité). |
| **Remise en service** | Demande de remise en service d'un actif hors service, avec simulation de l'impact positif sur la centrale. |
| **Simulation obligatoire** | Pour les 4 types de demande : situation actuelle vs. situation simulée (puissance, disponibilité), sur la centrale source **et** la centrale destination pour un déplacement, avec impact consolidé sur le parc. Calculée dans un scénario virtuel, sans jamais modifier les données réelles. |
| **Niveaux d'impact configurables** | Chaque simulation est classée Faible / Moyen / Important / Critique selon des seuils réglables par l'Administrateur. **Une demande à impact critique exige l'approbation finale d'un Administrateur**, même si elle concerne la centrale d'un Chef Centrale. |
| **Détection de simulation obsolète** | Avant transmission et avant approbation finale, le système recompare la situation actuelle à celle utilisée pour la simulation. En cas d'écart, l'étape est bloquée et une nouvelle simulation doit être relancée. |
| **Circuit de décision à deux niveaux** | Le Responsable Exploitation vérifie la pertinence de toute demande créée par le Responsable Mécanique, puis la transmet (ou la rejette avec motif) ; le Chef Centrale de la centrale concernée (ou l'Administrateur si impact critique) l'approuve — ce qui **exécute la demande immédiatement** — ou la rejette avec motif. **Transmettre et Approuver ouvrent chacun une fenêtre de confirmation avec une case à cocher obligatoire** (« Je confirme la validation de cette demande ») avant que l'action ne devienne possible, en plus du commentaire optionnel. Rejeter et Annuler ouvrent une fenêtre de saisie du motif (obligatoire) intégrée à l'application — plus aucune boîte de dialogue native du navigateur. |
| **Annulation** | Une demande non exécutée (en attente ou transmise) peut être annulée par son auteur ou un administrateur, avec motif obligatoire. |
| **Recalcul des performances** | Toujours calculé en direct à partir de l'état courant des actifs (actif, unité, centrale, parc) — jamais de valeur mise en cache. |
| **Historisation** | Chaque opération conserve l'auteur, la date, l'ancienne et la nouvelle valeur, le motif, la simulation associée et les deux décisions (Exploitation puis Chef Centrale). Rien n'est supprimable par un utilisateur standard. |
| **Audit** | Recherche/filtrage des événements par centrale, actif, utilisateur, période, type d'opération — Administrateur uniquement. |
| **Notifications** | Centre in-app (cloche, badge, marquage lu) : nouvelle demande à vérifier, demande transmise à approuver, simulation obsolète, demande rejetée/exécutée. |
| **Reporting / Power BI** | Tableau de bord analytique in-app (scopé à la centrale pour un Chef Centrale) + export CSV UTF-8 par entité (centrales, actifs, mouvements, demandes), importable dans Power BI Desktop ou Excel. |
| **Note d'arrêt pour travaux (NAPT)** | La demande de retrait permet de saisir les informations de coupure : date/heure de début de coupure, date de retour en exploitation, heure de fin de coupure, nombre de départs sur la rame, nombre de départs impactés par la coupure, liste des départs impactés, **liste des localités impactées**, **entreprise désignée pour les travaux** (choisie dans le référentiel Entreprises) et **présence ou non de clients industriels impactés** (avec leur liste le cas échéant). Depuis une demande de retrait ou de décommissionnement transmise/exécutée, génère ensuite une version imprimable tenant sur **une seule page A4** (`window.print()` → PDF, `@page` dédiée) du modèle officiel SOCAD'EL « Annexe 4/10 », pré-remplie avec toutes ces données ainsi que la centrale, l'actif (et sa hiérarchie), la puissance coupée, le motif, le demandeur et le responsable centrale. La **région électrique** affichée est celle enregistrée une fois pour toutes sur la fiche de la centrale. **Le document n'est plus modifiable à l'écran ni à l'impression** : les champs non suivis par l'application (référence de la note d'information) s'affichent vides (« — ») plutôt qu'en saisie libre. |
| **Code de référence DDR** | Pour une demande de retrait, dès sa transmission par le Responsable Exploitation, un code officiel est généré et figé au format `DDR_AA/JJ/MM/YY/ZZ-nom de la centrale` : `AA` = code de la région électrique de la centrale, `JJ/MM/YY` = date de validation par le chargé d'exploitation, `ZZ` = numéro d'ordre dans le mois **pour cette région** (repart à 1 chaque nouveau mois). Ce code remplace la référence NAPT sur le document imprimable. **Il n'apparaît que pour les demandes de retrait déjà transmises** — un décommissionnement, ou une demande de retrait transmise avant l'activation de cette fonctionnalité, conserve la référence générique `NAPT-000X` (sans code région). Relancer la simulation d'une demande déjà transmise efface le code, qui est régénéré lors de la nouvelle transmission. |
| **Entreprises (référentiel)** | Liste des entreprises désignables pour des travaux de retrait — nom, statut actif/inactif — gérée par l'Administrateur (créer/modifier/désactiver ; suppression bloquée si l'entreprise est déjà référencée sur une demande). Utilisée pour peupler le menu déroulant « Entreprise désignée » à la création d'une demande de retrait. |
| **Gestion des utilisateurs** | Création, modification, **suppression**, import (CSV/Excel) et export CSV des utilisateurs — Administrateur uniquement. Un Chef Centrale, un Responsable Mécanique et un Responsable Exploitation sont obligatoirement rattachés à une centrale. |

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
| Consultation de sa centrale, reporting, mouvements | ✅ (sa centrale) | ✅ (sa centrale) | ✅ (sa centrale) | ✅ (tout le parc) |
| Créer/modifier/importer/exporter centrales et actifs | ❌ | ❌ | ❌ | ✅ |
| Créer une demande | ✅ (sa centrale) | ❌ | ❌ | ✅ |
| Vérifier et transmettre / rejeter une demande | ❌ | ✅ (sa centrale) | ❌ | ✅ |
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
| Responsable Mécanique — Douala | `mecanique.douala@centrale.local` | `mecanique123` | Centrale Thermique de Douala |
| Responsable Exploitation — Douala | `exploitation.douala@centrale.local` | `exploitation123` | Centrale Thermique de Douala |
| Chef Centrale — Douala | `chef.douala@centrale.local` | `chefcentrale123` | Centrale Thermique de Douala |
| Responsable Mécanique — Song Loulou | `mecanique.songloulou@centrale.local` | `mecanique123` | Barrage Hydroélectrique de Song Loulou |
| Responsable Exploitation — Song Loulou | `exploitation.songloulou@centrale.local` | `exploitation123` | Barrage Hydroélectrique de Song Loulou |
| Chef Centrale — Song Loulou | `chef.songloulou@centrale.local` | `chefcentrale123` | Barrage Hydroélectrique de Song Loulou |

> Chaque centrale a besoin de son propre trio Mécanique/Exploitation/Chef
> Centrale pour que le circuit de demande fonctionne de bout en bout ; la
> Centrale Solaire de Maroua n'a pas d'équipe dédiée dans les données de
> démonstration (gérable par l'Administrateur uniquement) — un Administrateur
> peut en créer une à tout moment (page Utilisateurs).

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
  un Chef Centrale, un Responsable Mécanique ou un Responsable Exploitation
  à sa seule centrale (`centrale_id` sur l'utilisateur, obligatoire pour ces
  3 rôles). Un `GET /api/centrales/destinations` minimal (id/code/nom
  uniquement) reste accessible malgré le cloisonnement, pour permettre de
  choisir une centrale de destination lors d'un déplacement.
- **Transactions** : l'approbation d'une demande (changement d'état +
  journalisation + mise à jour du statut) est enveloppée dans une
  transaction SQLite (`withTransaction` dans `db.js`) : aucune opération
  n'est partiellement appliquée en cas d'échec.
- **Import/export CSV et Excel** : parseur et writer RFC4180 maison
  (`server/src/lib/csv.js`), avec BOM UTF-8 pour Excel. L'import accepte
  aussi un classeur **.xlsx**, lu par un mini-lecteur ZIP + XML écrit sans
  dépendance externe (`server/src/lib/xlsx.js`, DEFLATE via `node:zlib`) :
  aucune bibliothèque tierce n'est nécessaire pour ouvrir un fichier Excel.
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
│   │   ├── xlsx.js                    # lecteur .xlsx (ZIP + XML) sans dépendance externe
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

## Déploiement

> ⚠️ **Ne pas déployer sur Vercel** : cette application est un serveur
> Node.js classique et persistant (`http.createServer(...).listen()`) qui
> écrit ses données dans un fichier SQLite local (`server/data/`). Ce
> modèle n'est pas compatible avec Vercel, qui exécute du serverless ou du
> statique — sans configuration adaptée, cela produit une erreur
> `404 NOT_FOUND` sur toutes les routes, et même adapté, le système de
> fichiers serverless de Vercel est éphémère (la base SQLite serait
> réinitialisée à chaque invocation).

Il faut une plateforme qui supporte un service Node.js persistant : par
exemple **Render**, **Railway** ou **Fly.io** (VPS classique également
possible). Le code est déjà prêt (`process.env.PORT` est utilisé, aucune
dépendance à installer).

### Déployer sur Render (recommandé, plan gratuit)

Un fichier `render.yaml` est fourni à la racine du dépôt (déploiement en
tant que « Blueprint ») :

1. Sur [render.com](https://render.com), **New** → **Blueprint**, puis
   sélectionner ce dépôt Git.
2. Render détecte `render.yaml` et propose de créer le service
   `socadel-gestion-actifs` (Node, plan gratuit, `npm install` puis
   `npm start`) — valider.
3. Une fois déployé, l'application est accessible sur l'URL fournie par
   Render (`https://socadel-gestion-actifs.onrender.com` ou équivalent).

> Sur le plan gratuit de Render, le disque n'est pas persistant : la base
> SQLite est réinitialisée aux données de démonstration à chaque
> redémarrage/redéploiement (l'application régénère automatiquement le
> jeu de données de départ si la base est vide). Pour conserver des
> données réelles entre les redéploiements, passer sur un plan payant
> avec un **Persistent Disk** monté sur `server/data`, ou utiliser Railway
> / Fly.io avec un volume persistant.

## API REST (principales routes)

| Méthode | Route | Description |
|--------|--------|-------------|
| POST | `/api/auth/login`, `/api/auth/logout` | Connexion / déconnexion |
| GET | `/api/auth/me` | Utilisateur courant |
| GET/POST/PUT/DELETE | `/api/utilisateurs` | Gestion des utilisateurs (Administrateur) |
| GET/POST | `/api/utilisateurs/export`, `/import` | Import (CSV ou Excel `.xlsx`) / export CSV des utilisateurs |
| GET/POST/PUT/DELETE | `/api/centrales` | Centrales (scopées par centrale pour Chef Centrale/Mécanique/Exploitation) |
| GET | `/api/centrales/destinations` | Liste minimale (id/code/nom) de toutes les centrales actives, non cloisonnée (choix d'une destination de déplacement) |
| GET/POST | `/api/centrales/export`, `/import` | Import (CSV ou Excel `.xlsx`) / export CSV des centrales |
| GET | `/api/centrales/:id/dashboard?periode=` | Tableau de bord agrégé de la centrale (KPI, causes, alertes, historique, timeline, contribution au parc) |
| GET/POST/PUT/DELETE | `/api/actifs` | Actifs (scopés par centrale pour Chef Centrale/Mécanique/Exploitation) |
| GET/POST | `/api/actifs/export`, `/import` | Import (CSV ou Excel `.xlsx`) / export CSV des actifs (avec `parent_code`) |
| POST | `/api/actifs/:id/mettre-en-maintenance`, `/fin-maintenance`, `/mettre-en-reparation`, `/fin-reparation` | Actions opérationnelles directes (Chef Centrale de la centrale, Administrateur) |
| GET/POST | `/api/demandes`, `/api/demandes/preview` | Liste (scopée) / création (limitée à sa centrale pour Mécanique) / simulation à la volée |
| POST | `/api/demandes/:id/transmettre`, `/rejeter-exploitation` | Étape 1 : vérification par l'Exploitation (de la centrale de la demande) |
| POST | `/api/demandes/:id/approuver`, `/rejeter` | Étape 2 : approbation (= exécution) par le Chef Centrale |
| POST | `/api/demandes/:id/annuler`, `/relancer-simulation` | Annulation / relance de simulation obsolète |
| GET | `/api/mouvements` | Historique des mouvements exécutés (scopé par centrale) |
| GET | `/api/audit-log` | Journal d'audit filtrable (Administrateur) |
| GET/POST | `/api/notifications`, `/:id/lu`, `/lu-tout` | Centre de notifications |
| GET/PUT | `/api/parametres/impact` | Seuils de classification du niveau d'impact (Administrateur) |
| GET | `/api/reporting/summary` | Indicateurs agrégés (scopés par centrale pour un Chef Centrale) |
| GET | `/api/reporting/export/:entity` | Export CSV (`centrales`, `actifs`, `mouvements`, `demandes`) |
| GET/POST/PUT/DELETE | `/api/entreprises` | Référentiel des entreprises désignables pour les travaux (lecture pour tout utilisateur authentifié, écriture Administrateur) |

## Simplifications assumées

Vu l'ampleur du cahier des charges, quelques choix pragmatiques ont été
faits, documentés ici pour transparence :

- Le déplacement propose un choix binaire (actif seul / avec toute sa
  hiérarchie), pas la sélection fine d'un sous-ensemble d'actifs enfants.
- La détection de simulation obsolète compare la performance "avant"
  (et, pour un déplacement, la situation de la centrale destination) au
  moment de la transmission/approbation à celle du calcul initial ; elle
  ne rejoue pas une comparaison champ par champ de tous les attributs.
- L'import se fait en chargeant un fichier `.csv` ou `.xlsx` lu côté
  navigateur (texte pour le CSV, `ArrayBuffer` → base64 pour l'Excel) puis
  envoyé en JSON ; il n'y a pas d'upload multipart natif (contrainte
  zéro-dépendance).
- Seul le format Excel **moderne (.xlsx, OOXML)** est pris en charge à
  l'import, via un mini-lecteur ZIP + XML maison (`server/src/lib/xlsx.js`,
  première feuille du classeur uniquement). L'ancien format binaire **.xls
  (Excel 97-2003)** n'est pas supporté : l'implémenter sans dépendance
  externe aurait demandé un lecteur complet du format OLE2 Compound File +
  BIFF8, disproportionné ici. Un fichier `.xls` est rejeté avec un message
  clair invitant à l'enregistrer en `.xlsx` ou `.csv`.
- Un Responsable Mécanique et un Responsable Exploitation sont chacun
  rattachés à **une seule centrale** (comme le Chef Centrale) : ils ne
  créent/vérifient des demandes que pour les actifs de leur centrale. Un
  `GET /api/centrales/destinations` minimal reste accessible malgré ce
  cloisonnement pour permettre de choisir une centrale de destination lors
  d'un déplacement, sans exposer les données détaillées des autres
  centrales.
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
l'Administrateur (Chef Centrale bloqué en 403), cloisonnement du Chef
Centrale, du Responsable Mécanique et du Responsable Exploitation à leur
seule centrale sur le tableau de bord/demandes/actifs/mouvements/reporting
(vérifié avec deux équipes de centrale distinctes), blocage en 403 d'une
création de demande ou d'une transmission sur un actif/une demande d'une
autre centrale, accès non cloisonné à `/api/centrales/destinations` pour
choisir une centrale de déplacement malgré le cloisonnement, accès refusé
(403) sur les pages réservées à l'Administrateur, import/export CSV des
centrales, des actifs (avec relations mère/fils via `parent_code`) et des
utilisateurs (avec `centrale_code`), **import Excel (.xlsx)** round-trip
pour les trois entités (fichiers construits et vérifiés au format ZIP/XML
réel, y compris chaînes partagées, texte enrichi et accents UTF-8), rejet
propre d'un fichier `.xls` ou invalide, suppression d'un utilisateur,
reporting scopé par centrale, CRUD du référentiel Entreprises (création,
doublon rejeté en 409, modification, désactivation), formulaire de demande
de retrait avec entreprise désignée + bascule Oui/Non « clients industriels
impactés » + liste des localités impactées (saisie UI et persistance
vérifiées), affichage NAPT de ces champs, rendu de la NAPT sur **une seule
page A4** vérifié par comptage de pages du PDF généré (`page.pdf()`) y
compris sur le cas le plus chargé (actif avec hiérarchie complète de 8
ouvrages), et affichage des actifs par centrale limité au premier niveau
avec navigation vers le détail pour voir les actifs enfants.

Pour la réorganisation de la navigation : nouvelles pages **Centrales** et
**Actifs** (menu latéral, Administrateur) testées en CRUD complet
(création, modification, suppression, y compris via le sélecteur de
centrale sur la page Actifs) ; vérifié que le Tableau de bord et la fiche
analytique d'une centrale n'exposent plus aucun bouton de création,
modification, import ou export (0 élément trouvé) ; NAPT vérifiée
totalement non modifiable (0 `<input>` texte, 0 zone `contenteditable`, 0
case à cocher active restante) ; fenêtre de confirmation obligatoire sur
Transmettre et Approuver vérifiée (bouton désactivé tant que la case
« Je confirme… » n'est pas cochée, réactivé si elle est décochée) ; rejet
(Exploitation puis Chef Centrale) et annulation vérifiés via la nouvelle
fenêtre de saisie du motif obligatoire (blocage si le champ est vide,
demande bien rejetée/annulée avec le motif enregistré une fois rempli),
et confirmation qu'aucune boîte de dialogue native du navigateur
(`window.prompt`) n'apparaît plus sur ces trois actions.
