# Tableaux d'états

Application statique pour créer des boards d'états visuels et les utiliser en mode enfant avec drag-and-drop.

## Déploiement Netlify

- Build command: laisser vide
- Publish directory: `.`

Le fichier `netlify.toml` contient déjà la configuration minimale.

Les comptes utilisateur fonctionnent avec pseudo + mot de passe via Netlify Functions et Netlify Database. Une fois connecté, les boards sont sauvegardés dans des tables Postgres Netlify par utilisateur.

## Local

Lancer avec Node:

```bash
node local-server.js
```

Puis ouvrir `http://127.0.0.1:4173`.
