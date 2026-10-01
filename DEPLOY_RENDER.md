# Guide de Déploiement de MALAM'IA sur Render (Société Générale Côte d'Ivoire)

Ce guide décrit la procédure officielle et pas à pas pour déployer l'application **MALAM'IA** sur la plateforme Cloud **Render**.

---

## 📋 Prérequis

1. Un compte [Render.com](https://render.com/).
2. Un compte GitHub avec le dépôt de l'application **MALAM'IA** pushé.
3. Votre clé API Google Gemini (`GEMINI_API_KEY`).

---

## 🚀 Option 1 : Déploiement Automatique via Render Blueprint (Recommandé)

Grâce au fichier `render.yaml` inclus à la racine de votre projet :

1. Connectez-vous à votre tableau de bord [Render Dashboard](https://dashboard.render.com/).
2. Cliquez sur **New +** en haut à droite, puis sélectionnez **Blueprint**.
3. Connectez votre dépôt GitHub `sgci-rag-ai` / `MALAM'IA`.
4. Render détectera automatiquement le fichier `render.yaml`.
5. Renseignez la variable requise :
   - `GEMINI_API_KEY` : *Insérez votre clé API Google Gemini*.
6. Cliquez sur **Apply**. Render va installer les dépendances via `requirements.txt` et démarrer le serveur avec `gunicorn`.

---

## 🛠️ Option 2 : Manuel via "Web Service"

Si vous préférez créer le service manuellement dans Render :

1. Cliquez sur **New +** -> **Web Service**.
2. Choisissez **Build and deploy from a Git repository** et sélectionnez votre dépôt.
3. Configurez les paramètres suivants :
   - **Name** : `malam-ia-sgci`
   - **Language** : `Python 3`
   - **Branch** : `main` (ou votre branche courante)
   - **Build Command** : `pip install -r requirements.txt`
   - **Start Command** : `gunicorn server:app --bind 0.0.0.0:$PORT --timeout 120`
   - **Instance Type** : `Free` (ou Starter)
4. Dans la section **Environment Variables**, ajoutez :
   - `GEMINI_API_KEY` = `votre_cle_api_gemini_ici`
5. Cliquez sur **Create Web Service**.

---

## 🔑 Comptes de Démonstration & Accès Initial

Une fois le déploiement terminé, l'application est immédiatement opérationnelle. La base de données SQLite est initialisée et alimentée automatiquement lors du premier démarrage (`seed_demo.py`).

| Rôle | Identifiant (Matricule) | Mot de Passe | Nom / Poste |
| :--- | :--- | :--- | :--- |
| **Super Administrateur** | `ADMIN001` | `admin123` | Super Admin (Direction Générale) |
| **Apprenant (Assigné)** | `MAT001` | `pass123` | Yves KOUASSI (Conseiller Clientèle) |
| **Apprenant (Assigné)** | `MAT002` | `pass123` | Marc AKE (Analyste Crédit) |

---

## 📊 Suivi des Logs & Maintenance

- **Logs en direct** : Consultez l'onglet *Logs* dans le tableau de bord Render pour suivre les pings d'activité, les ingestions IA et les appels RAG.
- **Redémarrage** : Cliquez sur *Manual Deploy > Deploy latest commit* après chaque mise à jour pushée sur GitHub.
