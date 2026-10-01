# Référentiel d'Architecture Globale & Documentation Technique

**Plateforme T-chIA — Société Générale Côte d'Ivoire (SGCI)**  
*Direction des Ressources Humaines & SGCI Academy*  
*Version 2.0 (Architecture Modulaire, Haute Disponibilité & Production)*

---

## Sommaire Exécutif
1. [Architecture Globale & Systémique du Projet (Vue 360°)](#1-architecture-globale--systémique-du-projet-vue-360)
   - [Diagramme Architectural Global de Bout en Bout](#diagramme-architectural-global-de-bout-en-bout)
   - [Cycle de Vie d'une Formation (Data Flow)](#cycle-de-vie-dune-formation-data-flow)
   - [Architecture Détaillée du Pipeline d'Ingestion & Génération Multi-Artefacts](#architecture-détaillée-du-pipeline-dingestion--génération-multi-artefacts)
   - [Architecture des 3 Modes de Diffusion Interactive](#architecture-des-3-modes-de-diffusion-interactive)
   - [Matrice des Flux & Protocoles de Communication](#matrice-des-flux--protocoles-de-communication)
2. [Sous-Système d'Intelligence Artificielle & Multimodalité](#2-sous-système-dintelligence-artificielle--multimodalité)
   - [Moteur de Compréhension & Génération (Google Gemini 2.5)](#moteur-de-compréhension--génération-google-gemini-25)
   - [Pipeline RAG Vectoriel & ChromaDB](#pipeline-rag-vectoriel--chromadb)
   - [Module d'Audit & Benchmark RAG Super Admin (RAG Triad)](#module-daudit--benchmark-rag-super-admin-rag-triad)
   - [Tuteur Vocal & Synthèse Vocale (Edge-TTS)](#tuteur-vocal--synthèse-vocale-edge-tts)
   - [Échange Interactif Live (WebSocket Realtime & Hologramme)](#échange-interactif-live-websocket-realtime--hologramme)
3. [Base de Données Relationnelle (SQLite — database.db)](#3-base-de-données-relationnelle-sqlite--databasedb)
   - [Diagramme Entité-Association Complet](#diagramme-entité-association-complet)
   - [Dictionnaire des Données Exhaustif (11 Tables Métier)](#dictionnaire-des-données-exhaustif-11-tables-métier)
   - [Contraintes d'Intégrité & Indexation](#contraintes-dintégrité--indexation)
4. [Moteurs Métier & Algorithmes Clés](#4-moteurs-métier--algorithmes-clés)
   - [Calculateur des 10 Jours Ouvrés (Calendrier Bancaire CI)](#calculateur-des-10-jours-ouvrés-calendrier-bancaire-ci)
   - [Système d'Évaluation Hybride Certifiante (70% QCM / 30% Oral)](#système-dévaluation-hybride-certifiante-70-qcm--30-oral)
   - [Moteur d'Assignations Dynamiques Multi-critères](#moteur-dassignations-dynamiques-multi-critères)
5. [Architecture Frontend SPA & Modularité (js/ & templates/)](#5-architecture-frontend-spa--modularité-js--templates)
   - [Découpage des 17 Modules JavaScript](#découpage-des-17-modules-javascript)
   - [Découpage des Templates HTML (Vues & Composants)](#découpage-des-templates-html-vues--composants)
   - [Mécanisme de Persistance & Restauration Universelle (F5)](#mécanisme-de-persistance--restauration-universelle-f5)
6. [Catalogue Exhaustif des Endpoints API REST (server.py)](#6-catalogue-exhaustif-des-endpoints-api-rest-serverpy)
7. [Sécurité, Conformité & Traçabilité Réglementaire](#7-sécurité-conformité--traçabilité-réglementaire)
   - [Contrôle d'Accès Basé sur les Rôles (RBAC)](#contrôle-daccès-basé-sur-les-rôles-rbac)
   - [Conformité RGPD & AI Act (Divulgation & Consentement)](#conformité-rgpd--ai-act-divulgation--consentement)
   - [Audit Trail & Journalisation des Opérations](#audit-trail--journalisation-des-opérations)
8. [Système de Fichiers, Multimédia & Guides d'Exploitation](#8-système-de-fichiers-multimédia--guides-dexploitation)

---

## 1. Architecture Globale & Systémique du Projet (Vue 360°)

La plateforme **T-chIA** est une application web d'apprentissage augmenté d'envergure bancaire. Elle combine une interface utilisateur hautement réactive (SPA), un backend robuste en micro-services modulaires (Flask API), une base relationnelle ACID (SQLite), un moteur de recherche vectorielle (ChromaDB) et un écosystème d'IA multimodale (Google Gemini 2.5 + Edge-TTS).

### Diagramme Architectural Global de Bout en Bout

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT WEB (NAVIGATEUR APPRENANT / ADMIN)                      │
│                                                                                                  │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌────────────────┐  │
│  │   VUES MODULAIRES (templates/)  │   │     17 MODULES JS (js/)         │   │ BIBLIOTHÈQUES  │  │
│  │  - dashboard.html               │   │  - js/core/ (state, router...)  │   │  - PDF.js      │  │
│  │  - consultation.html / creation │   │  - js/pages/ (catalog, eval...) │   │  - Chart.js    │  │
│  │  - details.html (Live Tutor)    │   │  - js/components/ (navbar...)   │   │  - Canvas 2D   │  │
│  │  - presentation.html            │   │  - js/main.js (amorçage)        │   │  - Web Speech  │  │
│  │  - evaluation.html / users...   │   │  - Persistance F5 universelle   │   │  - WebRTC Audio│  │
│  └─────────────────────────────────┘   └─────────────────────────────────┘   └────────────────┘  │
└──────────────────────────────────┬───────────────────────────────┬───────────────────────────────┘
                                   │ HTTPS / REST (JSON)           │ WebSocket Bidirectionnel (Audio)
┌──────────────────────────────────▼───────────────────────────────▼───────────────────────────────┐
│                                SERVEUR BACKEND FLASK (server.py)                                 │
│                                                                                                  │
│  ┌───────────────────────────────────┐   ┌──────────────────────────────────────────────────┐    │
│  │  COUCHE SÉCURITÉ & AUTHENTIFICATION│   │  MOTEURS MÉTIER APPLICATIFS                      │    │
│  │  - RBAC (Super Admin / Admin / User)│  │  - Moteur d'Assignation Multi-critères (Matrice) │    │
│  │  - Isolation stricte Audit RAG (403)│ │  - Calculateur Délais 10j Ouvrés CI (Fériés)      │    │
│  │  - Traçabilité Consentement RGPD  │   │  - Validateur QCM & Analyseur Soutenance Orale   │    │
│  │  - Heartbeat Présence (Pings 45s) │   │  - Suivi d'avancement diapositive par diapositive│    │
│  └───────────────────────────────────┘   └──────────────────────────────────────────────────┘    │
└──────────────┬─────────────────────────────┬─────────────────────────────┬───────────────────────┘
               │ Lecture/Écriture SQL        │ Requêtes Vectorielles       │ Inférence Multimodale
┌──────────────▼─────────────┐ ┌─────────────▼─────────────┐ ┌─────────────▼───────────────────────┐
│ BASE RELATIONNELLE SQLITE  │ │ BASE VECTORIELLE CHROMADB │ │ SERVICES IA CLOUD & MULTIMÉDIA      │
│                            │ │                           │ │                                     │
│ - database.db              │ │ - ./chroma_db             │ │ - Google Gemini 2.5 (LLM & Juge)    │
│ - 11 Tables ACID           │ │ - Collection:             │ │ - text-embedding-004 (Vecteurs)     │
│ - Users, Courses, Progress │ │   ai_formation_courses    │ │ - Edge-TTS (Synthèse vocale neurale)│
│ - Assignments, Rules, Evals│ │ - 47 Chunks Sémantiques   │ │ - ReportLab / FPDF (Générateur PDF) │
│ - Consents, Logs, Pings    │ │ - Cosine Similarity       │ │ - python-pptx (Présentations PPTX)  │
└────────────────────────────┘ └───────────────────────────┘ └─────────────────────────────────────┘
               ▲                                                           ▲
               └─────────────────── ARCHIVES SUPPORTS ─────────────────────┘
                               FORMATIONS_ARCHIVES/FORMATION_{id}/
                               - PDF / PPTX normés SGCI
                               - narration.mp3 + timestamps.json
```

---

### Cycle de Vie d'une Formation (Data Flow)

Le cheminement d'une formation suit un flux automatisé en 6 étapes :

```
[1. Ingestion Documentaire]
  Collaborateur RH uploade un document (PDF/Word/Notes) ou saisit un sujet dans #page-creation.
       │
       ▼
[2. Traitement & Structuration IA (ai_generator.py)]
  - Gemini extrait le contenu, le découpe en diapositives structurées.
  - Edge-TTS génère la piste vocale (narration.mp3) et calcule les timestamps par diapositive.
  - ReportLab et python-pptx produisent les supports normés SGCI dans FORMATIONS_ARCHIVES/.
  - Génération automatique d'un jeu de questions QCM avec justifications pédagogiques.
       │
       ▼
[3. Vectorisation & Indexation Sémantique (ChromaDB)]
  - Le texte du cours est découpé en fragments de 600-800 caractères (overlap 100).
  - Calcul des embeddings via `text-embedding-004` (768 dimensions).
  - Stockage persistant dans la collection `ai_formation_courses`.
       │
       ▼
[4. Moteur d'Assignation & Échéances (course_assignments)]
  - Les règles RH (assignment_rules) ou les assignations manuelles créent les fiches de suivi.
  - Calcul automatique de la date d'échéance : 10 jours ouvrés bancaires ivoiriens.
       │
       ▼
[5. Apprentissage Interactif (Mode Présentation ou Mode Live IA)]
  - Mode Présentation : lecture PDF synchronisée avec la voix du tuteur, mémorisation de la slide.
  - Mode Live : échange oral avec l'avatar interactif via WebSocket Gemini Realtime.
  - Persistance totale : l'apprenant peut actualiser sa page (F5) sans perdre sa progression.
       │
       ▼
[6. Évaluation Certifiante & Diagnostic IA]
  - Déblocage automatique après complétion de la formation.
  - Double épreuve : QCM (70%) + Soutenance Orale (30%).
  - L'IA analyse les réponses, génère un diagnostic personnalisé (points forts / axes d'effort).
  - Délivrance de l'attestation si note composite >= 70%.
```

---

### Architecture Détaillée du Pipeline d'Ingestion & Génération Multi-Artefacts

Le pipeline de création automatisée transforme des documents d'entrée hétérogènes en un parcours pédagogique multimédia complet et certifiant.

```
========================================================================================================
[1. INGESTION BRUTE]       [2. RAISONNEMENT & EXTRACTION IA]      [3. GÉNERATION DES ARTEFACTS & RAG]
  Fichier Source             Gemini 2.5 Multimodal Engine            ChromaDB + PowerPoint COM + Edge-TTS
 (PDF / DOCX / IMG)              (JSON Schema Strict)
        │                                 │
        ▼                                 ▼
   Upload API         ┌───────────────────┴───────────────────┐
POST /api/create_course│  • Structure Pédagogique (Slides)      │──────► PPTX Corporate SGCI (python-pptx)
        │             │  • Script Voix T-chIA (Narration)     │──────► PDF Haute Fidélité (COM / FPDF)
                      │  • Base de Connaissances Spécialisée  │──────► Vectorisation Embeddings (ChromaDB)
                      │  • QCM de Contrôle & Justifications   │──────► Audio MP3 + timestamps.json (Edge-TTS)
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      [4. STOCKAGE & BASE DE DONNÉES]
                         data/database.db (SQLite 11 tables)
                         data/chroma_db/ (Vecteurs text-embedding-004)
                         static/courses/ & FORMATIONS_ARCHIVES/
========================================================================================================
```

#### Étape 1 : Réception & Ingestion du Document (`server.py`)
- **Point d'accès** : `POST /api/create_course`
- **Données reçues** : Fichier source (`file` : PDF, DOCX, TXT ou Image/Schéma), métadonnées (`title`, `domain`, `level`, `desc`, `visibility`, `tutor_voice`).
- **Génération d'identifiant** : Création d'un identifiant unique UUID (`task_id`) et calcul de la nomenclature officielle SGCI (`SGCI_TCHIA_[TYPE]_[TITRE]...`).
- **Sécurisation** : Écriture temporaire dans `uploads/` avec `secure_filename`.

#### Étape 2 : Inférence Pédagogique & Structuration JSON (`ai_generator.py`)
- Le fichier est uploadé vers l'API Google GenAI via `client.files.upload(file=raw_filepath)`.
- Modèle principal : `gemini-2.5-flash` (avec cascade automatique vers `gemini-2.0-flash` et `gemini-1.5-flash`).
- Un prompt unifié extrait en **un seul appel** un JSON strict sans balises parasites :
  1. **Métadonnées & Accueil** : `titre_cours`, `sommaire`, `narration_titre`, `narration_sommaire` (Règle SGCI : mot "Bienvenue" prononcé uniquement au tout début).
  2. **Diapositives structurées (`slides`)** : 4 à 6 diapositives avec `titre`, `puces` managériales et `narration` (script audio complet pour T-chIA).
  3. **Base de connaissances RAG (`knowledge_base`)** : Synthèse exhaustive, structurée et technique pour le moteur de questions-réponses.
  4. **Quiz d'évaluation (`quiz`)** : 4 à 5 questions (jusqu'à 15 max) avec `concept`, `options`, `correct_index` et `explication` pédagogique SGCI.

#### Étape 3 : Indexation Vectorielle RAG (`ChromaDB`)
- **Collection** : `ai_formation_courses` sous `data/chroma_db/`.
- **Chunking** : Découpage du texte de `knowledge_base` en segments de 1500 caractères (`CHUNK_SIZE = 1500`).
- **Embeddings** : Vectorisation via `text-embedding-004` (768 dimensions).
- **Indexation** : `ids = [f"{base_filename}_{i}"]` avec métadonnée source `{"source": base_filename}` pour filtrage par cours.

#### Étape 4 : Moteur Graphique Corporate (PowerPoint PPTX)
- Généré via `python-pptx` (`build_executive_presentation`).
- Application rigoureuse de la charte SGCI :
  - Rouge officiel SGCI : `#E9041E` (`RGBColor(233, 4, 30)`)
  - Titres et textes principaux : `#0F172A` (`RGBColor(15, 23, 42)`)
  - Sous-titres et métadonnées : `#475569` (`RGBColor(71, 85, 105)`)
  - Cartes de contenu : fond blanc `#FFFFFF`, contour subtil `#E2E8F0` et filigrane du logo officiel SGCI.
- Export au format officiel : `SGCI_TCHIA_PPTX_...pptx`.

#### Étape 5 : Conversion PDF Haute Fidélité
- **Moteur principal** : Automatisation COM PowerPoint (`comtypes.client.CreateObject("Powerpoint.Application")` -> format 32 PDF).
- **Moteur de secours (Fallback)** : Moteur vectoriel `FPDF` (`generate_pdf_fallback()`) garantissant la génération du PDF sur tout serveur.

#### Étape 6 : Synthèse Vocale Parallèle & Marqueurs Temporels (Edge-TTS)
- Génération multi-threads via `concurrent.futures.ThreadPoolExecutor(max_workers=6)` générant un segment MP3 par diapositive.
- Voix neuronales françaises (`fr-FR-HenriNeural`, `fr-FR-DeniseNeural`).
- Concaténation séquentielle avec `pydub.AudioSegment` en un fichier unique : `SGCI_TCHIA_..._narration.mp3`.
- Calcul des plages temporelles exactes `[start, end]` par slide, consignées dans `timestamps.json`.

#### Étape 7 : Persistance Transactionnelle & Archivage
- Enregistrement complet dans `data/database.db` (table `courses`).
- Archivage sous `FORMATIONS_ARCHIVES/FORMATION_{id}/SUPPORTS/` et exposition client sous `static/courses/`.

---

### Architecture des 3 Modes de Diffusion Interactive

```
                                  [PORTAIL APPRENANT]
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│ MODE PRÉSENTATION│             │   MODE LIVE IA   │             │ MODE ÉVALUATION  │
│  (Asynchrone)    │             │   (Synchrone)    │             │  (Certification) │
└────────┬─────────┘             └────────┬─────────┘             └────────┬─────────┘
         │                                │                                │
         ├► PDF.js (Rendu diapositives)   ├► WebSocket Gemini Live Bidi   ├► QCM Certifiant (70%)
         ├► Audio Player synchronisé      ├► AudioContext 16kHz (Micro)    │   - Tirage aléatoire
         ├► Suivi temps réel timestamps   ├► AudioContext 24kHz (Haut-p.)  │   - Feedback immédiat
         └► Assistant Chat RAG Flottant   ├► Lipsync SVG/Canvas animé      ├► Soutenance Orale (30%)
             - STT Whisper / Gemini       └► Suivi contextuel dynamique    │   - STT Gemini / Whisper
             - Vecteurs ChromaDB                                           │   - Jury IA (Gemini Judge)
             - Réponse vocale TTS                                          └► Diagnostic SGCI & Seuil 70%
```

#### Mode 1 : Mode Présentation Synchronisée (`static/js/pages/presentation.js`)
- **Affichage Documentaire** : Moteur PDF.js avec navigation slide par slide.
- **Synchronisation Vocale Automatique** : L'écouteur `timeupdate` de la balise HTML5 `<audio>` compare en continu `audio.currentTime` avec les intervalles du fichier `timestamps.json` pour basculer automatiquement de slide.
- **Assistant RAG Flottant** : Disponible en surimpression. Lorsqu'un collaborateur pose une question (écrite ou vocale) :
  1. Transcription STT (Gemini / Whisper) si message vocal.
  2. Recherche sémantique top-3 dans `ChromaDB` filtrée sur la source du cours.
  3. Formulation d'une réponse claire et factuelle par Gemini 2.5 Flash.
  4. Restitution vocale instantanée par Edge-TTS (`/api/tts`).

#### Mode 2 : Mode Live IA Interactif (`static/js/pages/live-tutor.js`)
- **Communication Bidirectionnelle Temps Réel** : Connexion WebSocket directe (`wss://generativelanguage.googleapis.com/.../BidiGenerateContent`).
- **Streaming Audio Full-Duplex** :
  - Capture micro collaborateur à **16 000 Hz** (PCM 16-bit).
  - Restitution voix avatar à **24 000 Hz** sans latence de bout en bout.
- **Lipsync Audio-Réactif** : Analyse spectrale en direct via l'API Web Audio (`AnalyserNode`), animant la bouche et l'aura de l'avatar selon les décibels émis.
- **Contextualisation Didactique** : Injection de l'état précis du cours (`getSlideTeachingPayload(slideNum)`) permettant au tuteur de commenter la diapositive affichée et d'interagir naturellement avec l'apprenant.

#### Mode 3 : Mode Évaluation & Certification SGCI (`static/js/pages/evaluation.js`)
La certification officielle de conformité bancaire repose sur une évaluation hybride :
1. **Épreuve Écrite QCM (Pondération 70%)** :
   - Test certifiant de 5 à 15 questions à choix multiples avec justifications pédagogiques.
   - Soumission à `POST /api/courses/<id>/evaluation`.
2. **Soutenance Orale Interactive (Pondération 30%)** :
   - Questions ouvertes de mise en situation concrète (`/api/courses/<id>/oral_questions`).
   - Enregistrement micro et transcription STT Gemini / Whisper.
   - Notation par un Jury IA (`Gemini Judge`) sur 100 points avec appréciation qualitative (`/api/courses/<id>/oral_evaluation`).
3. **Algorithme de Notation Composite** :
   $$\text{Note Finale} = (\text{Score QCM} \times 0.70) + (\text{Score Oral} \times 0.30)$$
   - **Seuil de Réussite** : $\text{Note Finale} \ge 70\%$.
   - Mise à jour immédiate du statut dans `course_assignments` (`completed` ou `failed`) et journalisation d'audit dans `audit_logs`.

---

### Matrice des Flux & Protocoles de Communication

| Canal | Protocole | Données Échangées | Fréquence / Déclenchement |
| :--- | :--- | :--- | :--- |
| **API Web Standard** | HTTPS / REST (JSON) | Requêtes CRUD, catalogue, utilisateurs, assignations | À l'interaction utilisateur |
| **Heartbeat Présence** | POST `/api/user/ping` | `user_id`, `course_id`, `module_id` | Automatique toutes les 45 secondes |
| **Tuteur Interactif Live**| WebSocket sécurisé (WSS) | Audio PCM / WebRTC streaming + JSON d'état | En temps réel lors de la session Live |
| **Streaming Documentaire**| HTTP Range Requests | Chunks de fichiers PDF et flux audio MP3 | À la lecture dans le navigateur |
| **Recherche Vectorielle** | IPC / Python Client | Vecteurs de 768 flottants et métadonnées | À chaque question posée au RAG |
| **Inférence LLM** | HTTPS (Google GenAI SDK) | Prompts structurés et complétions JSON | Lors de la création, du chat ou de l'audit |

---

## 2. Sous-Système d'Intelligence Artificielle & Multimodalité

### Moteur de Compréhension & Génération (Google Gemini 2.5)
- **Rôle Pédagogique** : Structuration de programmes de cours à partir de politiques bancaires brutes, génération de diapositives de synthèse et calibration des questions d'évaluation.
- **Rôle Juge Qualité (Audit RAG)** : Évaluation critique et non complaisante des réponses fournies par le système RAG sur une échelle de 0 à 100 selon les critères de fidélité documentaire et pertinence métier.

### Pipeline RAG Vectoriel & ChromaDB
- **Moteur Vectoriel** : ChromaDB en mode persistant local (`./chroma_db`).
- **Collection** : `ai_formation_courses` (47 fragments indexés).
- **Embeddings** : `models/text-embedding-004` (768 dimensions), optimisé pour la sémantique textuelle francophone et bancaire.
- **Algorithme de Similarité** : Cosine Similarity ($\cos(	heta) = rac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$).
- **Découpage Sémantique (Chunking)** : Blocs de 600 à 800 caractères avec un recouvrement (*overlap*) de 100 caractères afin d'éviter la perte d'informations critiques à la frontière des paragraphes.

### Module d'Audit & Benchmark RAG Super Admin (RAG Triad)
Accessible exclusivement au Super Administrateur via `/api/admin/rag_evaluation` et la vue `#page-rag-eval` :
1. **Pertinence du Contexte (Context Relevance)** : Mesure si les chunks retournés par ChromaDB sont exempts de bruit documentaire et ciblent précisément la requête.
2. **Fidélité / Non-hallucination (Groundedness)** : Vérifie qu'aucun élément de la réponse ne provient d'une extrapolation ou hallucination non corroborée par le document officiel.
3. **Pertinence de la Réponse (Answer Relevance)** : Mesure si la réponse finale est claire, synthétique et répond de manière opérationnelle à la question du collaborateur.
4. **Latence Moyenne (ms)** : Analyse comparative du temps de requête vectorielle (ChromaDB) versus temps d'inférence LLM (Gemini).

### Tuteur Vocal & Synthèse Vocale (Edge-TTS)
- **Voix Principale** : `fr-FR-HenriNeural` (voix masculine posée et professionnelle) ou `fr-FR-DeniseNeural` (voix féminine claire).
- **Génération de Timestamps** : Un analyseur phonétique et temporel consigne dans `timestamps.json` le minutage précis du basculement de chaque diapositive, permettant un défilement 100% synchronisé avec la narration.

### Échange Interactif Live (WebSocket Realtime & Hologramme)
- **Avatar T-chIA** : Modélisation vectorielle SVG avec animation d'états dynamiques :
  - `idle` : Veille attentive avec pulsation douce.
  - `listening` : Réception du signal micro collaborateur.
  - `thinking` : Recherche vectorielle RAG et formulation Gemini.
  - `speaking` : Élocution avec synchronisation labiale (lipsync) basée sur le niveau d'amplitude audio.

---

## 3. Base de Données Relationnelle (SQLite — database.db)

Le stockage transactionnel repose sur SQLite 3, offrant performance et traçabilité avec 11 tables relationnelles interconnectées.

### Diagramme Entité-Association Complet

```
                    ┌────────────────────────┐
                    │         users          │
                    │────────────────────────│
                    │ id (PK)                │
                    │ matricule (UQ)         │
                    │ nom, prenom, role      │
                    │ direction, poste       │
                    └───────────┬────────────┘
                                │ 1
       ┌────────────────────────┼────────────────────────┬────────────────────────┐
       │ *                      │ *                      │ *                      │ *
┌──────▼─────────────────┐┌─────▼──────────────────┐┌────▼─────────────────┐┌──────▼─────────────────┐
│  course_assignments    ││   course_evaluations   ││  oral_evaluations   ││ user_course_progress   │
│────────────────────────││────────────────────────││─────────────────────││────────────────────────│
│ id (PK)                ││ id (PK)                ││ id (PK)             ││ id (PK)                │
│ user_id (FK -> users)  ││ user_id (FK -> users)  ││ user_id (FK)        ││ user_id (FK)           │
│ course_id (FK->courses)││ course_id (FK->courses)││ course_id (FK)      ││ course_id (FK)         │
│ due_date, is_overdue   ││ score, answers_json    ││ score_oral, feedback││ current_slide          │
│ qcm_score, oral_score  ││ diagnostic_json        ││ transcript          ││ progress_percent       │
│ final_score, passed    ││ passed                 ││                     ││ completed_training     │
└──────┬─────────────────┘└─────┬──────────────────┘└────┬────────────────┘└──────┬─────────────────┘
       │ *                      │ *                      │ *                      │ *
       └────────────────────────┼────────────────────────┴────────────────────────┘
                                │ 1
                    ┌───────────▼────────────┐
                    │        courses         │
                    │────────────────────────│
                    │ id (PK)                │
                    │ title, desc, domain    │
                    │ pdf_url, pptx_url      │
                    │ audio_url, timestamps  │
                    │ quiz_data, slides_data │
                    └───────────▲────────────┘
                                │ 1..*
                    ┌───────────┴────────────┐
                    │    assignment_rules    │
                    │────────────────────────│
                    │ id (PK)                │
                    │ name, target_direction │
                    │ target_poste, contrat  │
                    │ max_anciennete_days    │
                    │ course_ids (JSON)      │
                    └────────────────────────┘

Tables d'Audit, de Sécurité & de Présence :
- user_consents       : user_id, disclosure_version, accepted_at, ip_address, status
- document_downloads  : user_id, course_id, doc_type (PDF/PPTX), downloaded_at
- active_user_pings   : user_id, course_id, module_id, last_ping (Heartbeat 45s)
- audit_logs          : user_id, action, object_type, object_id, metadata_json, created_at
```

---

### Dictionnaire des Données Exhaustif (11 Tables Métier)

*(Retrouvez le détail exhaustif champ par champ des tables `users`, `courses`, `course_assignments`, `assignment_rules`, `user_course_progress`, `course_evaluations`, `oral_evaluations`, `user_consents`, `document_downloads`, `active_user_pings`, et `audit_logs` dans le chapitre 2 de la présente documentation).*

---

## 4. Moteurs Métier & Algorithmes Clés

### Calculateur des 10 Jours Ouvrés (Calendrier Bancaire CI)
Conformément aux normes réglementaires SGCI, tout collaborateur assigné à une formation obligatoire dispose d'un délai strict de **10 jours ouvrés**.
- **Jours Ouvrés** : Sont exclus les samedis et dimanches.
- **Jours Fériés Bancaires Pris en Compte** :
  - Fêtes fixes : 1er Janvier (Jour de l'An), 1er Mai (Fête du Travail), 7 Août (Fête Nationale de l'Indépendance), 15 Août (Assomption), 1er Novembre (Toussaint), 15 Novembre (Journée Nationale de la Paix), 25 Décembre (Noël).
  - Fêtes mobiles calculées dynamiquement : Lundi de Pâques, Ascension, Lundi de Pentecôte, Fêtes musulmanes officielles (Tabaski, Ramadan, Maouloud, Nuit du Destin).
- Si la date de complétion dépasse la `due_date`, le système flagge l'enregistrement `is_overdue = 1` et remonte une alerte immédiate dans le Cockpit RH.

### Système d'Évaluation Hybride Certifiante (70% QCM / 30% Oral)
Pour garantir une certification indiscutable des compétences bancaires :
$$	ext{Note Finale} = (	ext{Score QCM} 	imes 0.70) + (	ext{Score Oral} 	imes 0.30)$$
- **Condition de Succès** : $	ext{Note Finale} \ge 70.0\%$
- **Épreuve Écrite (QCM)** : Maximum 15 questions calibrées avec chronométrage.
- **Épreuve Orale (Soutenance)** : Mise en situation pratique, enregistrement audio de l'argumentation ou saisie textuelle structurée, analysée selon une grille de conformité réglementaire par l'IA.

### Moteur d'Assignations Dynamiques Multi-critères
Permet aux administrateurs RH de définir des règles intelligentes d'attribution de formations :
- Filtre par Direction (ex: `direction == 'Direction des Risques'`)
- Filtre par Poste (ex: `poste == 'Chargé d'Affaires Entreprises'`)
- Filtre par Contrat (ex: `statut_contrat == 'CDI'`)
- Filtre par Ancienneté d'Embauche (ex: collaborateurs recrutés depuis moins de 90 jours)
- Synchronisation en 1 clic : application immédiate de la règle à l'ensemble du personnel correspondant avec création automatique des échéances.

---

## 5. Architecture Multi-Pages Dédiée & Modularité (1 Page = 1 URL = 1 Template)

L'application respecte une **stricte étanchéité de production Multi-Pages (MPA)** : chaque fonctionnalité dispose désormais de sa propre URL, de sa propre route Flask sécurisée et de son propre template dédié. **Aucun écran ni tableau de bord n'est mélangé.**

### Découpage des 17 Modules JavaScript

```text
static/js/
├── config.js               (Configuration applicative, voix TTS, seuils et flags)
├── core/
│   ├── state.js            (État global partagé : courses, currentUser, allUsers, sélections)
│   ├── theme.js            (Gestionnaire des thèmes : Blanc, Gris Slate, Noir)
│   ├── router.js           (Routeur multi-pages, navigation d'URL, restauration d'état)
│   └── auth.js             (Connexion vers /dashboard, déconnexion vers /login, contrôle RGPD)
├── components/
│   ├── navbar.js           (Menu déroulant utilisateur, badges de rôles)
│   ├── modals.js           (Modales de profil, historique des évaluations & certificats)
│   └── assistant-chat.js   (Widget assistant flottant, commandes vocales & chat RAG)
├── pages/
│   ├── users.js            (Gestion des apprenants, CRUD, import massif CSV)
│   ├── assignments.js      (Moteur d'assignations, règles automatiques, matrice de suivi)
│   ├── catalog.js          (Catalogue de formations, filtres par domaine, modale de mode)
│   ├── creation.js         (Formulaire de création de cours & extraction automatique IA)
│   ├── presentation.js     (Mode 1 : Présentation synchronisée PDF, audio & timestamps)
│   ├── live-tutor.js       (Mode 2 : Avatar tuteur IA, WebSocket Gemini Live, WebRTC)
│   ├── evaluation.js       (Mode 3 : Quiz de connaissances & diagnostic pédagogique)
│   ├── dashboard.js        (Tableau de bord analytics, graphiques Chart.js, export CSV)
│   └── rag-eval.js         (Évaluation & benchmark RAG exclusif Super Admin)
└── main.js                 (Point d'entrée : initialisation contextuelle selon l'URL)
```

### Découpage des Templates HTML (1 Page = 1 URL = 1 Template Dédié)

```text
templates/
├── base.html                (Squelette maître : En-tête SGCI, navigation, widget T-chIA, scripts)
├── login.html               (Route /login       : Page dédiée de connexion pure, ZÉRO dashboard)
├── dashboard.html           (Route /dashboard   : Tableau de Bord exclusif selon le rôle)
│   ├── pages/user_dashboard.html  (Vue exclusive Apprenant : 4 KPIs, formations, échéances 10J)
│   └── pages/admin_dashboard.html (Vue exclusive Admin : Cockpit DRH, graphiques, export CSV)
├── catalogue.html           (Route /catalogue   : Catalogue des formations, filtres et recherche)
├── users.html               (Route /users       : Gestion des collaborateurs - Admin & Superadmin)
├── assignments.html         (Route /assignments : Matrice d'affectations RH - Admin & Superadmin)
├── creation.html            (Route /creation    : Studio d'ingestion & génération IA - Admin/Superadmin)
├── presentation.html        (Route /presentation: Mode 1 - Diaporama PDF & Narration audio synchro)
├── details.html             (Route /details     : Mode 2 - Séance interactive Live IA avec T-chIA)
├── evaluation.html          (Route /evaluation  : Mode 3 - QCM 70% & Soutenance orale 30%)
├── rag-eval.html            (Route /rag-eval    : Audit RAG & Benchmark - Superadmin exclusif)
├── index.html               (Master wrapper de compatibilité et tests de conformité SGCI)
└── components/
    ├── header-nav.html      (Barre de navigation principale supérieure SGCI avec liens d'URLs)
    ├── disclosure-modal.html (Modale de Consentement Éthique IA & Conformité RGPD)
    ├── modals.html          (Ensemble des modales applicatives et formulaires overlay)
    └── assistant-widget.html (Bouton flottant d'assistance vocale T-chIA)
```

### Table des Routes Serveur & Contrôles d'Accès (RBAC)

| URL Publique | Méthode | Template Associé | Rôles Autorisés | Comportement si non autorisé |
|---|---|---|---|---|
| `/login` | `GET` | `login.html` | Tout visiteur | Affichage formulaire de connexion pur |
| `/` | `GET` | *(Redirection)* | Connecté | Redirige vers `/dashboard` (ou `/login`) |
| `/dashboard` | `GET` | `dashboard.html` | `user`, `admin`, `superadmin` | Redirige vers `/login` si anonyme |
| `/catalogue` | `GET` | `catalogue.html` | `user`, `admin`, `superadmin` | Redirige vers `/login` si anonyme |
| `/users` | `GET` | `users.html` | `admin`, `superadmin` | Redirige vers `/dashboard` si `user` |
| `/assignments` | `GET` | `assignments.html` | `admin`, `superadmin` | Redirige vers `/dashboard` si `user` |
| `/creation` | `GET` | `creation.html` | `admin`, `superadmin` | Redirige vers `/dashboard` si `user` |
| `/rag-eval` | `GET` | `rag-eval.html` | `superadmin` | Redirige vers `/dashboard` si `admin` ou `user` |
| `/presentation` | `GET` | `presentation.html` | Tous profils connectés | Redirige vers `/login` si anonyme |
| `/details` | `GET` | `details.html` | Tous profils connectés | Redirige vers `/login` si anonyme |
| `/evaluation` | `GET` | `evaluation.html` | Tous profils connectés | Redirige vers `/login` si anonyme |

### Règle d'Isolation Stricte par Profil Utilisateur
1. **Page de Connexion (`/login`)** :
   - Fichier indépendant : `templates/login.html`.
   - **Garantie d'étanchéité** : Elle ne contient **aucun** composant de dashboard, aucun code de catalogue, aucun lecteur de présentation, aucun menu d'administration.
2. **Tableaux de Bord Spécifiques** :
   - **Administrateur / Super Admin** : Reçoit exclusivement `admin_dashboard.html` (Indicateurs & Synthèse, Connectés en direct, Activité par formation, Téléchargements, Suivi individuel, Alertes retards, Export CSV).
   - **Apprenant (`user`)** : Reçoit exclusivement `user_dashboard.html` (Mon espace de formation, Mes 4 cartes KPIs personnelles, Mes parcours assignés avec échéances à 10 jours ouvrés).
3. **Outils d'Administration Exclusifs** :
   - Les routes `/users`, `/assignments`, `/creation` et `/rag-eval` sont protégées côté serveur : un compte apprenant est immédiatement bloqué et redirigé.
4. **Vues Partagées** :
   - Le catalogue (`catalogue.html`), le lecteur (`presentation.html`), l'avatar (`details.html`) et la certification (`evaluation.html`) ont chacun leur propre URL dédiée et sont accessibles aux utilisateurs authentifiés.

### Mécanisme de Persistance & Restauration Universelle (F5)
1. Lors de toute navigation ou changement de diapositive, l'état précis (`targetPage`, `course_id`, `mode`, `slide_number`) est écrit dans `sessionStorage` et `localStorage`, et synchronisé avec le hash d'URL (`#presentation`, `#details`, `#rag-eval`, etc.).
2. À chaque actualisation de la page (`F5`), la fonction `restoreActiveCourseIfApplicable()` réhydrate l'état dès que `loadCourses()` a rapatrié les données de l'API Flask :
   - En **Mode Présentation** : le document PDF et l'audio se repositionnent instantanément sur la diapositive active.
   - En **Mode Live IA** : l'avatar se reconnecte à la formation active.
   - En **Mode Évaluation** : le quiz pour la formation cible est restauré sans interruption.

---

## 6. Catalogue Exhaustif des Endpoints API REST (server.py)

*(Voir le tableau récapitulatif des 40+ endpoints REST au Chapitre 4 de la documentation technique).*

---

## 7. Sécurité, Conformité & Traçabilité Réglementaire

### Contrôle d'Accès Basé sur les Rôles (RBAC)
- **Super Administrateur (`superadmin`)** : Droit de supervision total, accès exclusif à la page d'Audit RAG & Benchmark (`#page-rag-eval`), suppression de cours et gestion des administrateurs.
- **Administrateur RH (`admin`)** : Accès au cockpit de pilotage, création de formations, gestion des utilisateurs apprenants, création de règles d'assignation et export des rapports de formation.
- **Apprenant (`user`)** : Accès au catalogue, consultation des formations assignées et libres, passage des évaluations, téléchargement des supports autorisés.

### Conformité RGPD & AI Act (Divulgation & Consentement)
Tout accès à la plateforme est bloqué tant que le collaborateur n'a pas formellement accepté la modale de **Consentement et Divulgation IA** :
- Information claire sur l'utilisation d'un système d'IA générative.
- Rappel formel du strict respect du **Secret Bancaire** (interdiction d'injecter des données confidentielles de clients).
- Horodatage et journalisation certifiée dans la table `user_consents`.

---

## 8. Système de Fichiers, Multimédia & Guides d'Exploitation

### Arborescence Système de Production Complète
```text
SGCI_2026_001/10_09_2026_001_bon/
├── data/                               # Données persistantes
│   ├── database.db                     # Base SQLite principale (11 tables)
│   └── chroma_db/                      # Base vectorielle ChromaDB persistante
├── static/                             # Fichiers statiques web
│   ├── css/
│   │   └── style.css                   # Feuille de style globale (Charte SGCI)
│   ├── img/
│   │   └── logo.png                    # Logo institutionnel SGCI
│   ├── js/                             # 17 Modules JavaScript spécialisés
│   │   ├── config.js                   # Configuration frontend
│   │   ├── main.js                     # Amorçage de l'application
│   │   ├── core/                       # Modules de base (state, theme, router, auth)
│   │   ├── components/                 # Composants réutilisables (navbar, modals, chat)
│   │   └── pages/                      # Modules JS dédiés par page fonctionnelle
│   ├── courses/                        # Fichiers de cours mis à disposition du client
│   └── thumbnails/                     # Vignettes graphiques des formations
├── templates/                          # Templates HTML modulaires (Jinja2)
│   ├── index.html                      # Template principal Master (servi par render_template)
│   ├── pages/                          # 9 Vues HTML indépendantes
│   └── components/                     # Composants & modales HTML découpés
├── FORMATIONS_ARCHIVES/                # Dépôt officiel et immuable des cours
│   └── FORMATION_{id}/
│       └── SUPPORTS/
│           ├── SGCI_TCHIA_PDF_...pdf   # Support PDF normé SGCI
│           ├── SGCI_TCHIA_PPTX_...pptx # Support PowerPoint officiel
│           ├── narration.mp3           # Fichier audio généré par Edge-TTS
│           └── timestamps.json         # Minutage de synchronisation des slides
├── uploads/                            # Fichiers sources déposés temporairement
├── build_index.py                      # Recompilateur automatique de templates/index.html
├── evaluate_rag.py                     # Moteur de benchmark RAG CLI / Backend
├── test_tchia.py                       # Suite automatisée de tests de conformité SGCI (12/12)
├── server.py                           # Serveur principal Flask API & Templates
├── README.md                           # Documentation de prise en main rapide
└── DOCUMENTATION_TECHNIQUE.md          # Référentiel technique intégral d'architecture
```

### Commandes Opérationnelles de Base
```powershell
# Démarrer l'application (Port 8092)
python server.py

# Recompiler l'interface HTML après édition de templates
python build_index.py

# Lancer la suite de tests unitaires et de sécurité
python test_tchia.py

# Lancer un benchmark RAG unitaire
python evaluate_rag.py --query "Quelles sont les obligations de vigilance LAB ?"
```
