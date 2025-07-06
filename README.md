# USM API - Backend

API backend pour User Stories Manager (USM), fournissant une interface REST complète pour la gestion de projets agiles avec authentification OAuth, base de données SQLite et intégration IA.

## 🚀 Fonctionnalités

### 🔐 Authentification et Sécurité
- **OAuth Google** : Authentification sécurisée via Google
- **Sessions JWT** : Gestion des sessions avec tokens sécurisés
- **CORS configuré** : Sécurité cross-origin pour le développement et la production
- **Middleware d'authentification** : Protection des routes sensibles

### 📊 Gestion des Données
- **Projets** : CRUD complet pour les projets
- **User Stories** : Gestion complète des user stories avec métadonnées
- **Accès utilisateurs** : Système de permissions par projet
- **Thèmes utilisateur** : Personnalisation de l'interface
- **Import/Export** : Fonctionnalités d'import et export de données

### 🤖 Intégration IA
- **Chat OpenAI** : Intégration avec GPT-4o-mini pour l'assistant IA
- **Streaming** : Réponses en streaming pour une meilleure UX
- **Outils MCP** : Intégration du Model Context Protocol pour les outils d'analyse
- **Métriques automatiques** : Calcul et analyse des métriques de projet

### 📈 API REST
- **RESTful** : API REST complète et cohérente
- **Validation** : Validation des données d'entrée
- **Gestion d'erreurs** : Gestion robuste des erreurs avec codes HTTP appropriés
- **Documentation** : Endpoints bien documentés

## 🛠️ Technologies

- **Node.js** : Runtime JavaScript
- **Express.js** : Framework web pour l'API
- **SQLite** : Base de données légère et portable
- **Passport.js** : Authentification OAuth
- **JWT** : Tokens de session sécurisés
- **CORS** : Gestion des requêtes cross-origin
- **OpenAI API** : Intégration IA

## 📦 Installation

### Prérequis
- [Node.js](https://nodejs.org/) (v18 ou supérieur)
- [Git](https://git-scm.com/)
- Compte Google pour l'authentification OAuth

### Installation

1. **Cloner le dépôt**
   ```bash
   git clone <url-du-repo>
   cd usm-api
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configuration Google OAuth**
   - Allez sur [Google Cloud Console](https://console.cloud.google.com/)
   - Créez un nouveau projet ou sélectionnez un existant
   - Activez l'API Google+ 
   - Créez des identifiants OAuth 2.0
   - Configurez les URIs de redirection autorisés :
     - Développement : `http://localhost:3000/auth/google/callback`
     - Production : `https://votre-domaine.com/auth/google/callback`

4. **Configuration de l'environnement**
   Créez un fichier `.env` à la racine :
   ```env
   # Configuration Google OAuth
   GOOGLE_CLIENT_ID=votre_client_id_google
   GOOGLE_CLIENT_SECRET=votre_client_secret_google
   
   # Sécurité
   SESSION_SECRET=une_cle_secrete_tres_longue_et_complexe
   JWT_SECRET=une_autre_cle_secrete_pour_jwt
   
   # Configuration serveur
   PORT=3000
   NODE_ENV=development
   
   # URL Frontend (pour les redirections)
   FRONTEND_URL=http://localhost:5173
   
   # OpenAI (optionnel, pour l'IA)
   OPENAI_API_KEY=votre_cle_api_openai
   ```

5. **Initialiser la base de données**
   ```bash
   npm run init-db
   ```

6. **Démarrer le serveur**
   ```bash
   npm start
   ```

## 📁 Structure du projet

```
usm-api/
├── index.js                 # Point d'entrée principal
├── db.js                    # Configuration de la base de données
├── auth.middleware.js       # Middleware d'authentification
├── schema.sql              # Schéma de la base de données
├── routes/                 # Routes API
│   ├── projects.routes.js  # Gestion des projets
│   ├── userstories.routes.js # Gestion des user stories
│   ├── access.routes.js    # Gestion des accès
│   ├── importexport.routes.js # Import/Export
│   ├── ai-chat.routes.js   # Chat IA
│   └── mcp.routes.js       # Outils MCP
├── MCP/                    # Outils MCP
│   ├── schemas.js          # Schémas des outils
│   └── server-logic.js     # Logique des outils
├── package.json
└── .env                    # Variables d'environnement
```

## 🔌 API Endpoints

### Authentification
- `GET /auth/google` - Démarre l'authentification Google
- `GET /auth/google/callback` - Callback OAuth Google
- `POST /auth/logout` - Déconnexion
- `GET /user` - Informations utilisateur actuel

### Projets
- `GET /projects` - Liste des projets de l'utilisateur
- `POST /projects` - Créer un nouveau projet
- `GET /projects/:id` - Détails d'un projet
- `PUT /projects/:id` - Modifier un projet
- `DELETE /projects/:id` - Supprimer un projet

### User Stories
- `GET /projects/:id/userstories` - User stories d'un projet
- `POST /projects/:id/userstories` - Créer une user story
- `PUT /projects/:id/userstories/:storyId` - Modifier une user story
- `DELETE /projects/:id/userstories/:storyId` - Supprimer une user story

### Accès et Partage
- `GET /projects/:id/access` - Liste des accès au projet
- `POST /projects/:id/access` - Ajouter/modifier un accès
- `DELETE /projects/:id/access/:userId` - Retirer un accès
- `GET /users` - Liste des utilisateurs (pour le partage)

### IA et Chat
- `POST /ai-chat` - Chat avec l'IA (mode normal)
- `POST /ai-chat-stream` - Chat avec l'IA (mode streaming)
- `POST /ai-chat-stream-init` - Initialisation du streaming
- `GET /ai-chat-stream-events` - Événements de streaming

### Configuration
- `GET /user/theme` - Thème de l'utilisateur
- `PUT /user/theme` - Modifier le thème
- `GET /health/db` - Vérification de la base de données

## 🤖 Intégration IA

### Configuration OpenAI
Pour activer l'assistant IA, ajoutez votre clé API OpenAI dans le fichier `.env` :
```env
OPENAI_API_KEY=sk-votre_cle_api_openai
```

### Outils MCP
L'API intègre des outils MCP pour permettre à l'IA de :
- Analyser les métriques du projet
- Lister et filtrer les user stories
- Créer, modifier et supprimer des user stories
- Calculer les estimations et dates

### Streaming
L'API supporte le streaming des réponses IA pour une meilleure expérience utilisateur :
- Réponses en temps réel
- Gestion des timeouts
- Gestion des erreurs robuste

### Configuration nginx pour la production
Pour que le streaming fonctionne correctement en production avec nginx, ajoutez cette configuration dans votre serveur nginx (dans Plesk, utilisez la zone "nginx configuration") :

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_cache_bypass $http_upgrade;

# Configuration spécifique pour les EventSource (Server-Sent Events)
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 75s;
proxy_set_header Accept-Encoding "";
```

**Important :** Cette configuration doit être appliquée au domaine de l'API (ex: `api.votre-domaine.com`) et non au domaine principal du frontend.

## 🔧 Développement

### Scripts disponibles
```bash
npm start          # Démarre le serveur en mode production
npm run dev        # Démarre le serveur en mode développement
npm run init-db    # Initialise la base de données
npm test           # Lance les tests
npm run lint       # Vérifie le code
```

### Mode développement
En mode développement, l'API :
- Affiche des logs détaillés
- Vérifie la configuration Google OAuth
- Utilise des ports de développement
- Active le hot-reload

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | Environnement | `development` |
| `GOOGLE_CLIENT_ID` | ID client Google OAuth | - |
| `GOOGLE_CLIENT_SECRET` | Secret client Google OAuth | - |
| `SESSION_SECRET` | Secret pour les sessions | `secret` |
| `JWT_SECRET` | Secret pour les JWT | `dev-secret` |
| `FRONTEND_URL` | URL du frontend | `http://localhost:5173` |
| `OPENAI_API_KEY` | Clé API OpenAI | - |

## 🗄️ Base de données

### Schéma
La base de données SQLite contient les tables suivantes :
- `users` - Utilisateurs et leurs préférences
- `projects` - Projets créés
- `user_stories` - User stories avec métadonnées
- `project_access` - Droits d'accès aux projets

### Initialisation
```bash
npm run init-db
```

### Sauvegarde
La base de données est stockée dans `usm.sqlite`. Pour la sauvegarder :
```bash
cp usm.sqlite backup_$(date +%Y%m%d_%H%M%S).sqlite
```

## 🔒 Sécurité

### Authentification
- OAuth Google pour l'authentification
- Sessions JWT sécurisées
- Middleware d'authentification sur toutes les routes protégées

### CORS
- Configuration CORS dynamique selon l'environnement
- Origines autorisées configurées
- Credentials activés pour les cookies

### Validation
- Validation des données d'entrée
- Sanitisation des requêtes
- Gestion des erreurs robuste

## 🚀 Déploiement

### Production
1. Configurez les variables d'environnement pour la production
2. Utilisez un process manager comme PM2 :
   ```bash
   npm install -g pm2
   pm2 start index.js --name usm-api
   ```

### Docker (optionnel)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📚 Documentation API

### Codes de réponse
- `200` - Succès
- `201` - Créé avec succès
- `400` - Requête invalide
- `401` - Non authentifié
- `403` - Accès refusé
- `404` - Ressource non trouvée
- `500` - Erreur serveur

### Format des réponses
```json
{
  "success": true,
  "data": { ... },
  "message": "Opération réussie"
}
```

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créez une branche pour votre fonctionnalité
3. Committez vos changements
4. Poussez vers la branche
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

**API robuste et sécurisée pour la gestion agile moderne !** 