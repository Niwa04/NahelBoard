# Tableaux d'états

Application statique pour créer des boards d'états visuels et les utiliser en mode enfant avec drag-and-drop.

## Déploiement Netlify

- Build command: laisser vide
- Publish directory: `.`

Le fichier `netlify.toml` contient déjà la configuration minimale.

Activer aussi Netlify Identity dans le projet Netlify pour utiliser les comptes utilisateur. Une fois connecté, les boards sont sauvegardés en ligne par utilisateur via Netlify Functions et Netlify Blobs.

## Local

Lancer avec Node:

```bash
node local-server.js
```

Puis ouvrir `http://127.0.0.1:4173`.
