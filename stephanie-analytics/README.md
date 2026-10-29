# Stéphanie Analytics

Remplacement indépendant de Matomo : Worker Cloudflare + D1, tableau de bord privé et collecte sans cookie ni adresse IP.

## Ce qui est inclus

- Pages vues, sessions techniques, pages d'entrée/sortie, sources UTM/référents, appareils, navigateurs et contacts mesurés.
- Durée moyenne et taux de rebond estimés à partir d'un événement de sortie, avec limites clairement affichées.
- Vue des visiteurs actifs sur les cinq dernières minutes et événements récents.
- Ville, région et pays approximatifs fournis par Cloudflare, sans enregistrer l'adresse IP brute.
- Authentification Basic côté serveur, en-têtes de sécurité, vérification d'origine, validation des données et limitation légère anti-abus.
- Conservation automatique de 395 jours via un Cron Worker, sans collecte d'IP, cookie, fingerprint, position ou contenu de formulaire.
- Le tracker fonctionne sans popup en mode audience-only, uniquement si les conditions d'exemption CNIL sont respectées. Il respecte `Do Not Track` et expose `window.stephanieAnalyticsOptOut()` pour le retrait.

## Mise en service Cloudflare

1. Depuis ce dossier, exécuter `npx wrangler login`.
2. Créer la base : `npx wrangler d1 create stephanie-analytics`.
3. Remplacer `REPLACE_WITH_D1_DATABASE_ID` dans `wrangler.toml` par l'identifiant retourné.
4. Initialiser la base : `npx wrangler d1 execute stephanie-analytics --remote --file=./schema.sql`.
5. Si une base version 1 existe déjà, appliquer aussi `npx wrangler d1 execute stephanie-analytics --remote --file=./migrations/0002_add_geography.sql`.
6. Définir les secrets : `npx wrangler secret put ADMIN_USER` et `npx wrangler secret put ADMIN_PASSWORD`.
7. Remplacer `REPLACE_WITH_YOUR_WORKER_DOMAIN` dans `tracker.js` par le domaine HTTPS du Worker.
8. Déployer : `npx wrangler deploy`.
9. Après validation juridique et ajout d'une information claire dans la politique de confidentialité, charger `tracker.js` sur les pages publiques.
10. Ouvrir `/admin` sur le domaine du Worker avec les identifiants définis.

Ne jamais mettre l'identifiant D1, les secrets ou un token Cloudflare dans GitHub. Le dashboard ne doit pas être ajouté au menu, au sitemap ou aux pages publiques.

## Limites assumées

Ce projet ne prétend pas identifier des personnes, mesurer des appels réellement décrochés, fournir une adresse précise ou inventer des données SEO. La ville est une estimation réseau : elle peut être absente ou erronée pour un VPN, un mobile ou un réseau partagé. Search Console, import Matomo et MFA Cloudflare Access nécessitent encore une configuration de compte séparée. Cloudflare Free inclut des quotas qui doivent être surveillés avant la mise en production.
