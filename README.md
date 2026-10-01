# T-chIA — Plateforme Intelligente de Formation SGCI
**Société Générale Côte d'Ivoire (SGCI) — Direction des Ressources Humaines & SGCI Academy**

---

## 1. Présentation Générale

**T-chIA** est la solution corporate d'apprentissage augmenté par Intelligence Artificielle conçue pour les collaborateurs de la **Société Générale Côte d'Ivoire**. Elle transforme les politiques bancaires, procédures opérationnelles, documents réglementaires et référentiels métiers en parcours de formation dynamiques, interactifs et auditables.

La solution intègre :
- **Un tuteur pédagogique IA interactif ("T-chIA")** capable de dispenser le cours à l'oral (Edge-TTS) et d'animer des sessions questions/réponses contextuelles basées sur le RAG bancaire SGCI.
- **Un moteur de génération documentaire** produisant des supports normés aux standards SGCI (PDF et présentations PPTX) ainsi que des quiz d'évaluation calibrés.
- **Un système de certification rigoureux** combinant épreuve écrite QCM (70%) et soutenance orale argumentée (30%) pour les formations obligatoires assignées.
- **Un cockpit de pilotage RH & Formation (LMS / LXP)** offrant un suivi en temps réel des utilisateurs connectés, du respect des échéances réglementaires à 10 jours ouvrés, et des téléchargements de supports.

---

## 2. Architecture Technique & Fonctionnelle

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (SPA Vanilla JS)                       │
│  - Charte Graphique SGCI & T-chIA (Bandeau rouge & noir)             │
│  - Modal de Divulgation IA & Consentement RGPD / Conformité            │
│  - Lecteur de Cours Ergonomique (Contenu d'abord, volet questions)    │
│  - Module d'Évaluation Composite (QCM + Soutenance Orale Audio/Texte)  │
│  - Cockpit Administrateur RH (6 onglets de métriques & export CSV)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST & Heartbeat Pings (45s)
┌───────────────────────────────────▼────────────────────────────────────┐
│                   BACKEND API (FastAPI / Flask Python)                 │
│  - Gestionnaire de sessions & d'authentification (Tokens Base64)       │
│  - Moteur de calcul des délais ouvrés (10 jours CI + jours fériés)     │
│  - Système de traçabilité, Consentements & Pings actifs (en mémoire)   │
│  - Module d'évaluation orale avec analyse d'argumentation IA          │
└──────────────┬─────────────────────────────┬───────────────────────────┘
               │                             │
┌──────────────▼─────────────┐ ┌─────────────▼───────────────────────────┐
│     PERSISTANCE & DONNÉES  │ │        IA GÉNÉRATIVE & MULTIMÉDIA       │
│  - SQLite (database.db)    │ │  - Google GenAI SDK (Gemini 2.5)        │
│  - ChromaDB (Vecteurs RAG) │ │  - Edge-TTS (Synthèse vocale neurale)   │
│  - Tables d'audit & logs   │ │  - ReportLab / FPDF (PDF) & PPTX        │
└────────────────────────────┘ └─────────────────────────────────────────┘
```

> [!TIP]
> **Documentation Technique Détaillée** : Retrouvez le dictionnaire complet des données (11 tables SQLite), les métadonnées ChromaDB, les 40+ endpoints REST et l'arborescence des 17 modules JavaScript dans le fichier dédié : [DOCUMENTATION_TECHNIQUE.md](file:///c:/Users/dicko/SGCI_2026_001/10_09_2026_001_bon/DOCUMENTATION_TECHNIQUE.md).

---

## 3. Principales Règles Métier & Conformité Bancaire

### A. Délais d'Accomplissement à 10 Jours Ouvrés (Côte d'Ivoire)
- **Formations Assignées** : Tout collaborateur assigné à une formation obligatoire dispose d'un délai strict de **10 jours ouvrés** à compter de la date d'assignation.
- **Calendrier Bancaire Ivoirien** : Le calcul exclut systématiquement les samedis et dimanches, ainsi que les jours fériés légaux en vigueur en Côte d'Ivoire (1er janvier, Pâques, Lundi de Pâques, Fête du Travail, Ascension, Pentecôte, Fête Nationale du 7 août, Assomption, Toussaint, Fête de la Paix du 15 novembre, Noël, etc.).
- **Formations Publiques / Libres** : Les formations en libre accès ne portent aucune contrainte d'échéance (`due_date = NULL`, `is_overdue = 0`).

### B. Transparence IA & Consentement Collaborateur
- Lors de sa première connexion ou mise à jour des politiques, le collaborateur est soumis à un écran de **Divulgation de l'IA & Consentement**.
- Le passage requiert la validation explicite de 3 engagements :
  1. Utilisation exclusive pour les besoins de formation professionnelle SGCI.
  2. Prise de connaissance du rôle d'assistance pédagogique de l'IA sans prise de décision disciplinaire automatique.
  3. Non-divulgation de données client confidentielles (Secret Bancaire / RGPD).
- Tout consentement est horodaté et historisé dans la table `user_consents`.

### C. Évaluation & Certification (Pondération 70% / 30%)
- **Formations Assignées (Double Épreuve)** :
  - **Épreuve Écrite (QCM)** : Compte pour **70%** de la note finale. Cadré à un maximum de 15 questions à choix multiples.
  - **Épreuve Orale / Soutenance** : Compte pour **30%** de la note finale. Le collaborateur enregistre sa voix ou soumet une argumentation structurée répondant aux questions de mise en situation.
  - **Seuil de Réussite** : La note composite finale $\ge 70\%$ est requise pour la certification.
- **Formations Publiques** : Évaluation à 100% sur QCM (plafonné à 15 questions, seuil 70%).

### D. Norme de Nommage & Archivage Documentaire
- Tous les supports générés respectent la nomenclature SGCI :
  ```
  SGCI_TCHIA_[TYPE]_[FORMATION]_[MODULE]_[VERSION]_[DATE].[ext]
  ```
- Les supports sont archivés automatiquement sous :
  ```
  FORMATIONS_ARCHIVES/FORMATION_{id}/SUPPORTS/
  ```

---

## 4. Cockpit de Pilotage RH & Formation

L'espace Administrateur / RH propose 6 vues analytiques :
1. **Vue d'ensemble** : Taux de complétion, formations actives, moyenne générale des évaluations et total des téléchargements.
2. **Collaborateurs en ligne** : Indicateur dynamique des apprenants actifs au cours des 5 dernières minutes (Heartbeat).
3. **Activité par formation** : Métriques détaillées par cours (inscrits, complétés, note moyenne, taux de réussite).
4. **Supports téléchargés** : Suivi des consultations de documents PDF et présentations PPTX.
5. **Timeline pédagogique individuelle** : Recherche par collaborateur pour auditer son parcours complet (consentements, modules consultés, notes QCM, scores oraux, statuts d'échéance).
6. **Formations en retard** : Alertes sur les dépassements du délai de 10 jours ouvrés pour relance managériale.
- **Bouton d'export CSV** : Extraction complète en un clic des données de pilotage pour reporting DRH.

---

## 5. Comptes de démonstration / développement

Pour tester et évaluer la solution en environnement de développement ou de démonstration, utilisez les comptes préconfigurés ci-dessous.

> [!IMPORTANT]
> Conformément aux standards de sécurité bancaire SGCI, aucun mot de passe n'est affiché en clair ni pré-rempli dans l'interface utilisateur de connexion.

| Rôle | Nom / Profil | Identifiant (Matricule) | Mot de passe | Description & Périmètre |
| :--- | :--- | :--- | :--- | :--- |
| **Administrateur RH** | Responsable Formation SGCI | `ADMIN001` | `admin123` | Accès complet au Cockpit de pilotage, création de formations, suivi des retards, timeline collaborateurs et export CSV. |
| **Apprenant (Assigné)** | Collaborateur Réseau Bancaire | `MAT001` | `pass123` | Parcours obligatoire avec échéance de 10 jours ouvrés, double évaluation (QCM 70% + Oral 30%). |
| **Apprenant (Libre)** | Conseiller Clientèle SGCI | `MAT002` | `pass123` | Consultation libre des modules, supports téléchargeables et QCM de validation. |

---

## 6. Installation & Démarrage

### Prérequis
- Python 3.10+
- Clé d'API Google Gemini configurée dans le fichier `.env` (`GEMINI_API_KEY=...`)

### Lancement du Serveur
```powershell
# Installation des dépendances
pip install -r requirements.txt

# Lancement du serveur backend T-chIA (port 8092)
python server.py
```

Accédez ensuite à l'application web depuis votre navigateur :
```
http://localhost:8092
```

### Exécution de la Suite de Tests Automatisés
Pour vérifier l'ensemble des 12 cas de validation (conformité des délais ouvrés, traçabilité des consentements, pondération 70/30, sécurisation de la connexion, pings actifs, etc.) :
```powershell
python test_tchia.py
```
