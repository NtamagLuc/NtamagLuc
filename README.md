# Gestion de retrait des actifs de centrales de production d'électricité

Application de gestion des actifs (équipements) d'un parc de centrales de
production d'électricité : suivi des actifs par centrale, hiérarchie
actif mère / actifs enfants, **retrait** d'un actif du service, et
**déplacement** d'un actif d'une centrale vers une autre — avec, dans les
deux cas, une **simulation de l'impact sur la performance** des centrales
concernées avant toute confirmation.

## Aperçu fonctionnel

- **Centrales** : nom, type (thermique, hydraulique, nucléaire, solaire,
  éolien), localisation, capacité nominale (MW), seuil d'alerte de
  performance (%).
- **Actifs** : rattachés à une centrale, avec statut (en service, en
  maintenance, retiré), criticité (faible → critique), contribution en MW,
  et une hiérarchie **actif mère / actifs enfants** (ex : une turbine
  "mère" avec un générateur et des capteurs "enfants").
- **Retrait d'un actif** : le retrait (et celui de ses actifs enfants, qui
  suivent automatiquement) est simulé avant confirmation : la page affiche
  le score de performance de la centrale *avant/après*, ainsi que des
  alertes contextuelles (actif critique, baisse significative, passage
  sous le seuil recommandé…).
- **Déplacement d'un actif vers une autre centrale** : même principe de
  simulation, mais sur les **deux** centrales (source et destination), pour
  visualiser à la fois la perte de performance côté source et le gain (ou
  le risque de surcharge) côté destination.
- **Historique** : chaque retrait/déplacement/remise en service confirmé
  est enregistré avec un horodatage, les scores avant/après et les alertes
  déclenchées.

Le score de performance d'une centrale est calculé comme la puissance
effective de ses actifs (pondérée par leur statut : 100 % en service, 50 %
en maintenance, 0 % retiré) rapportée à sa capacité nominale.

## Architecture technique

> ⚠️ **Contrainte d'environnement** : l'accès au registre npm (et à tout
> CDN externe) est bloqué dans ce sandbox d'exécution — `npm install`
> renvoie une erreur 403 même pour un simple `curl`. Il n'a donc pas été
> possible d'installer Express, React ou Vite comme prévu initialement.
> L'application a été construite **sans aucune dépendance externe** :

- **Backend** : Node.js pur (`node:http` + `node:sqlite`, natif depuis
  Node 22). Un mini-framework façon Express (`server/src/lib/miniweb.js`)
  fournit le routage, le parsing JSON et le CORS en ~150 lignes.
- **Base de données** : SQLite via le module natif `node:sqlite`
  (fichier `server/data/retrait-actifs.sqlite`, créé et peuplé
  automatiquement au premier démarrage).
- **Frontend** : JavaScript vanilla (ES modules), sans framework ni étape
  de build — un routeur par hash fait maison (`client/public/js/router.js`)
  et des fonctions de rendu qui génèrent du HTML. Servi directement en
  fichiers statiques par le même serveur Node.

Résultat : **une seule commande, aucune installation**, pour lancer
l'application complète (API + interface).

```
gestion-retrait-actifs/
├── server/
│   ├── src/
│   │   ├── db.js                 # schéma SQLite + données de démonstration
│   │   ├── index.js              # point d'entrée HTTP (API + fichiers statiques)
│   │   ├── lib/miniweb.js        # mini-framework HTTP (routage, JSON, CORS)
│   │   ├── routes/               # centrales.js, actifs.js, mouvements.js
│   │   └── services/performance.js  # calcul du score + génération des alertes
│   └── data/                     # fichier SQLite (généré, ignoré par git)
└── client/
    └── public/
        ├── index.html
        ├── css/styles.css
        └── js/                   # api.js, router.js, app.js, components/, pages/
```

## Lancer l'application

Prérequis : Node.js ≥ 22 (pour `node:sqlite`).

```bash
node server/src/index.js
# ou, depuis la racine :
npm start
```

Puis ouvrir http://localhost:4000 dans un navigateur. Le port peut être
changé via la variable d'environnement `PORT`.

Au premier démarrage, la base est initialisée avec trois centrales de
démonstration (thermique, hydraulique, solaire) et leurs actifs.

## API REST

| Méthode | Route                                   | Description                                   |
|--------|-------------------------------------------|------------------------------------------------|
| GET    | `/api/centrales`                          | Liste des centrales + performance calculée     |
| POST   | `/api/centrales`                          | Créer une centrale                             |
| GET    | `/api/centrales/:id`                      | Détail d'une centrale + ses actifs             |
| PUT    | `/api/centrales/:id`                      | Modifier une centrale                          |
| DELETE | `/api/centrales/:id`                      | Supprimer une centrale (si elle n'a plus d'actifs) |
| GET    | `/api/actifs?centraleId=`                 | Liste des actifs (filtrable par centrale)      |
| POST   | `/api/actifs`                             | Créer un actif (avec `parentId` optionnel)     |
| GET    | `/api/actifs/:id`                         | Détail d'un actif + enfants + historique       |
| PUT    | `/api/actifs/:id`                         | Modifier un actif                              |
| DELETE | `/api/actifs/:id`                         | Supprimer un actif (s'il n'a pas d'enfants)     |
| POST   | `/api/actifs/:id/preview-retrait`         | Simuler le retrait (aucune écriture)           |
| POST   | `/api/actifs/:id/retrait`                 | Confirmer le retrait (cascade aux enfants)     |
| POST   | `/api/actifs/:id/remise-en-service`       | Remettre un actif retiré en service            |
| POST   | `/api/actifs/:id/preview-deplacement`     | Simuler un déplacement (`centraleDestId`)      |
| POST   | `/api/actifs/:id/deplacement`             | Confirmer le déplacement (cascade aux enfants) |
| GET    | `/api/mouvements`                         | Historique des retraits/déplacements           |

## Tests effectués

Le flux complet a été validé via des scénarios automatisés (Playwright) :
navigation tableau de bord → détail centrale, création de centrale/actif,
retrait avec simulation d'impact, déplacement entre deux centrales avec
simulation avant/après sur les deux centrales, et consultation de
l'historique — sans erreur console.
