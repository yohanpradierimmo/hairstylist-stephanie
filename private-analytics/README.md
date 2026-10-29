# Stéphanie Hairstylist · Tableau de bord privé (prototype)

Ce dossier est un projet **séparé** du site public. Ne jamais déployer ce dossier comme sous-page publique GitHub Pages.

## Architecture
- Interface statique `public/index.html` (maquette fonctionnelle).
- Serveur Node `server.mjs` : protège l'interface par authentification HTTP Basic et interroge Matomo côté serveur.
- Jeton Matomo uniquement dans les variables d'environnement du serveur, **jamais dans GitHub ni dans le navigateur**.
- Les appels Matomo sont limités à un ID de site configuré et à des méthodes autorisées.
- Ne pas héberger sur GitHub Pages : cet hébergement ne peut pas exécuter ce serveur.

## Démarrage local
Node.js 20+ requis.

```sh
cd private-analytics
cp .env.example .env
# renseigner les variables dans un environnement sécurisé, sans commiter .env
set -a; . ./.env; set +a
node server.mjs
```
Ouvrir http://localhost:8787 et saisir l'identifiant et le mot de passe définis.

## Déploiement
Utiliser un hébergement Node compatible HTTPS, avec secrets côté serveur et contrôle d'accès. Le service gratuit éventuel dépend des quotas de l'hébergeur. Ne pas activer en production avant d'avoir configuré un mot de passe fort, HTTPS et vérifié les droits du jeton Matomo.

## Limites
La disponibilité des métriques dépend de Matomo et de ses paramètres. Les données géographiques ne sont pas des adresses précises. Les statistiques Google Search Console nécessitent une intégration distincte. Les clics téléphone et rendez-vous nécessitent des événements Matomo configurés. Respecter RGPD, consentement et minimisation des données.
