import sys
import os
import pptx
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    # Couleurs SGCI / T-chIA
    COLOR_RED = RGBColor(233, 4, 30)      # SG Red #E9041E
    COLOR_SLATE = RGBColor(15, 23, 42)    # Slate Dark #0F172A
    COLOR_DARK_BLUE = RGBColor(30, 41, 59) # #1E293B
    COLOR_WHITE = RGBColor(255, 255, 255)
    COLOR_GRAY_BG = RGBColor(248, 250, 252) # #F8FAFC
    COLOR_BORDER = RGBColor(226, 232, 240)
    COLOR_TEXT_DARK = RGBColor(15, 23, 42)
    COLOR_TEXT_MUTED = RGBColor(100, 116, 139)
    COLOR_EMERALD = RGBColor(16, 185, 129)
    COLOR_PURPLE = RGBColor(147, 51, 234)

    blank_layout = prs.slide_layouts[6] # Blank slide

    def add_header(slide, title_text, subtitle_text, category_tag="SGCI ACADEMY | DIRECTION INNOVATION"):
        # Header Box Background
        header_box = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(1.1))
        header_box.fill.solid()
        header_box.fill.fore_color.rgb = COLOR_SLATE
        header_box.line.color.rgb = COLOR_SLATE

        # SG Red Top Line Accent
        red_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.08))
        red_line.fill.solid()
        red_line.fill.fore_color.rgb = COLOR_RED
        red_line.line.color.rgb = COLOR_RED

        # Category Tag Badge
        tf_tag = header_box.text_frame
        tf_tag.margin_left = Inches(0.5)
        tf_tag.margin_top = Inches(0.12)
        p_tag = tf_tag.paragraphs[0]
        p_tag.text = category_tag
        p_tag.font.size = Pt(9)
        p_tag.font.bold = True
        p_tag.font.color.rgb = COLOR_RED

        # Main Title
        p_title = tf_tag.add_paragraph()
        p_title.text = title_text
        p_title.font.size = Pt(20)
        p_title.font.bold = True
        p_title.font.color.rgb = COLOR_WHITE

        # Subtitle
        if subtitle_text:
            p_sub = tf_tag.add_paragraph()
            p_sub.text = subtitle_text
            p_sub.font.size = Pt(11)
            p_sub.font.color.rgb = RGBColor(203, 213, 225)

        # Footer
        footer_box = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.1), Inches(13.333), Inches(0.4))
        footer_box.fill.solid()
        footer_box.fill.fore_color.rgb = COLOR_SLATE
        footer_box.line.color.rgb = COLOR_SLATE

        tf_f = footer_box.text_frame
        tf_f.margin_left = Inches(0.5)
        tf_f.margin_top = Inches(0.08)
        pf = tf_f.paragraphs[0]
        pf.text = "T-chIA — Pré-soutenance PFE Master Data Science & IA | Société Générale Côte d'Ivoire"
        pf.font.size = Pt(9)
        pf.font.color.rgb = RGBColor(148, 163, 184)

    def add_card(slide, left, top, width, height, title, items, bg_color=COLOR_WHITE, border_color=COLOR_BORDER, title_color=COLOR_SLATE):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1.5)

        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_right = Inches(0.25)
        tf.margin_top = Inches(0.2)
        tf.margin_bottom = Inches(0.2)

        if title:
            p0 = tf.paragraphs[0]
            p0.text = title
            p0.font.size = Pt(14)
            p0.font.bold = True
            p0.font.color.rgb = title_color
            p0.space_after = Pt(8)
            first_item = True
        else:
            first_item = False

        for item in items:
            if first_item:
                p = tf.add_paragraph()
            else:
                p = tf.paragraphs[0]
                first_item = True
            p.text = item
            p.font.size = Pt(11)
            p.font.color.rgb = COLOR_TEXT_DARK
            p.space_after = Pt(6)

    # =========================================================================
    # SLIDE 1 : TITRE / PAGE DE GARDE
    # =========================================================================
    slide1 = prs.slides.add_slide(blank_layout)
    bg1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = COLOR_SLATE
    bg1.line.fill.background()

    # Red accent stripe left
    stripe = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(0.3), Inches(7.5))
    stripe.fill.solid()
    stripe.fill.fore_color.rgb = COLOR_RED
    stripe.line.fill.background()

    # Title Box
    tf1 = slide1.shapes.add_textbox(Inches(0.8), Inches(1.2), Inches(11.5), Inches(5.0)).text_frame
    tf1.word_wrap = True

    p = tf1.paragraphs[0]
    p.text = "SOCIÉTÉ GÉNÉRALE CÔTE D'IVOIRE (SGCI)"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = COLOR_RED
    p.space_after = Pt(15)

    p = tf1.add_paragraph()
    p.text = "T-chIA : Plateforme Intelligente de Formation Continue par IA Générative & RAG Multimodal"
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = COLOR_WHITE
    p.space_after = Pt(15)

    p = tf1.add_paragraph()
    p.text = "Pré-soutenance PFE & Pitch d'Innovation Stratégique pour la Direction Innovation"
    p.font.size = Pt(16)
    p.font.color.rgb = RGBColor(203, 213, 225)
    p.space_after = Pt(30)

    p = tf1.add_paragraph()
    p.text = "• Candidat : MABIALA Bergin — Master 2 Data Science, Big Data & IA\n• Période de stage : 15 Juillet – 20 Novembre 2026\n• Structure d'accueil : SGCI Academy & Direction des Ressources Humaines"
    p.font.size = Pt(13)
    p.font.color.rgb = RGBColor(148, 163, 184)

    # =========================================================================
    # SLIDE 2 : CONTEXTE & PROBLEMATIQUE METIER
    # =========================================================================
    slide2 = prs.slides.add_slide(blank_layout)
    add_header(slide2, "1. Contexte & Problématique Métier Bancaire", "Du E-learning traditionnel passif à la nécessité d'un apprentissage augmenté et auditatif")

    add_card(slide2, 0.6, 1.4, 5.8, 5.4, "❌ Les Défis du Mode Traditionnel", [
        "• Délais de conception extrêmement longs : 3 semaines en moyenne par parcours de formation pour les équipes RH.",
        "• Dépendance forte aux experts métiers : Indisponibilité récurrente des cadres bancaires pour animer les sessions présentiel.",
        "• Coûts logistiques & opérationnels élevés : Immobilisation des agents du réseau d'agences et frais d'organisation.",
        "• Passivité de l'apprentissage : Diaporamas statiques, absence d'interactivité vocale et de soutien personnalisé.",
        "• Risque de non-conformité bancaire : Difficulté de suivi du respect de l'échéance stricte de 10 jours ouvrés pour les formations obligatoires (LAB/FT, secret bancaire)."
    ], bg_color=RGBColor(254, 242, 242), border_color=RGBColor(252, 165, 165), title_color=COLOR_RED)

    add_card(slide2, 6.8, 1.4, 5.8, 5.4, "🎯 La Question de Recherche & Solution T-chIA", [
        "• Question Centrale : Comment automatiser et personnaliser la formation bancaire par l'IA Générative tout en garantissant 0% d'hallucination et une conformité réglementaire totale ?",
        "• Réponse apportée par T-chIA :",
        "  - Ingestion documentaire automatique (Word, PDF, Procédures SGCI).",
        "  - Génération de supports normés SGCI (PPTX/PDF) & audio Edge-TTS en < 2 minutes.",
        "  - Tuteur pédagogique IA interactif fondé sur le RAG bancaire ChromaDB + Gemini 2.5.",
        "  - Moteur de conformité calculant la limite stricte de 10 jours ouvrés ivoiriens."
    ], bg_color=RGBColor(240, 253, 244), border_color=RGBColor(134, 239, 172), title_color=COLOR_EMERALD)

    # =========================================================================
    # SLIDE 3 : ETAT DE L'ART & SOCLE TECHNOLOGIQUE
    # =========================================================================
    slide3 = prs.slides.add_slide(blank_layout)
    add_header(slide3, "2. État de l'Art & Positionnement Technologique", "L'évolution des Systèmes Tuteurs Intelligents vers le Generative-ITS (G-ITS)")

    add_card(slide3, 0.6, 1.4, 3.8, 5.4, "1️⃣ Évolution des Systèmes", [
        "• Génération 1 (E-learning) : Parcours séquentiels identiques pour tous, contenus rigides.",
        "• Génération 2 (LMS Adaptatif) : Arbres de décision, règles précalculées.",
        "• Génération 3 (Tuteur IA / G-ITS) : Inférence en langage naturel, contextualisation dynamique par RAG."
    ])

    add_card(slide3, 4.7, 1.4, 3.8, 5.4, "2️⃣ Moteur LLM & RAG Vectoriel", [
        "• Google Gemini 2.5 Flash : Modèle multimodal rapide, haute fidélité et fenêtre contextuelle étendue.",
        "• ChromaDB Vector Store : Base vectorielle embarquée haute performance avec embeddings `text-embedding-004` (768 dimensions).",
        "• Stratégie de Chunking : Decoupage sémantique 600-800 caractères avec chevauchement 100 caractères."
    ])

    add_card(slide3, 8.8, 1.4, 3.9, 5.4, "3️⃣ Multimédia & Serveur App", [
        "• Edge-TTS Neurale : Synthèse vocale fluide du tuteur T-chIA avec génération de timestamps.",
        "• Flask / FastAPI Server : Architecture micro-services Python, REST API & WebSocket Realtime.",
        "• Single Page Application (SPA) : Frontend Vanilla JS modulaire (17 modules), réactif et conforme à la charte SGCI."
    ])

    # =========================================================================
    # SLIDE 4 : ARCHITECTURE SYSTEMIQUE END-TO-END
    # =========================================================================
    slide4 = prs.slides.add_slide(blank_layout)
    add_header(slide4, "3. Architecture Systémique End-to-End (Vue 360°)", "Du document brut à l'expérience d'apprentissage augmentée et certifiante")

    add_card(slide4, 0.6, 1.4, 12.1, 5.4, "🏗️ Pipeline End-to-End T-chIA", [
        "1. INGESTION & PIPELINE DOCUMENTAIRE MULTIMODAL",
        "   • Upload par le formateur RH de procédures bancaires (PDF, DOCX) ou sujet brut.",
        "   • Découpage sémantique & Vectorisation ChromaDB (`ai_formation_courses`).",
        "   • Production automatique des supports corporate normés SGCI (PPTX via python-pptx / PDF via ReportLab).",
        "   • Génération de la piste vocale `narration.mp3` et des quiz certifiants avec justifications.",
        "",
        "2. DIFFUSION INTERACTIVE MULTI-MODES & PERSISTANCE",
        "   • Mode Présentation : Support visuel synchronisé avec la voix du tuteur T-chIA.",
        "   • Mode Live IA : Session questions/réponses interactive basée sur le RAG bancaire.",
        "   • Mécanisme de persistance F5 : Restauration immédiate de l'état de l'apprenant sans perte de progression.",
        "",
        "3. COCKPIT DE PILOTAGE & CONFORMITÉ RH",
        "   • Tracking en temps réel via Pings Heartbeat (45s) et table SQLite `database.db`."
    ], bg_color=COLOR_GRAY_BG, border_color=COLOR_BORDER)

    # =========================================================================
    # SLIDE 5 : MOTEURS METIER & CONFORMITE BANCAIRE
    # =========================================================================
    slide5 = prs.slides.add_slide(blank_layout)
    add_header(slide5, "4. Moteurs Métier Intelligents & Conformité Bancaire", "Calculateur d'échéances sur jours ouvrés et évaluation composite certifiante")

    add_card(slide5, 0.6, 1.4, 5.8, 5.4, "📅 Moteur des 10 Jours Ouvrés (Côte d'Ivoire)", [
        "• Exigence Métier : Toute formation attribuée d'office doit être achevée dans un délai strict de 10 jours ouvrés.",
        "• Algorithme de Calcul Bancaire CI :",
        "  - Exclusion des samedis et dimanches.",
        "  - Exclusion dynamique des jours fériés légaux en Côte d'Ivoire (1er Janvier, Fête du Travail, 7 Août, Fête de la Paix 15 Nov, Noël, fêtes religieuses).",
        "• Transparence & Alertes : Badge visuel dynamique ('J-3 restants', 'En retard') et notifications automatiques dans le cockpit RH.",
        "• Traçabilité : Historisation des assignations et des échéances."
    ])

    add_card(slide5, 6.8, 1.4, 5.8, 5.4, "🎓 Évaluation Composite Certifiante (70 / 30)", [
        "• Double Épreuve pour les Formations Assignées :",
        "  - Épreuve Écrite (70% de la note) : QCM dynamique de 15 questions max générées à partir du corpus RAG.",
        "  - Épreuve Orale / Soutenance (30% de la note) : Le collaborateur répond à l'oral ou par texte argumenté à une mise en situation métier.",
        "• Évaluation par IA Juge : Diagnostic automatique argumenté par Gemini 2.5 sur la pertinence et la maîtrise conceptuelle.",
        "• Seuil de Certification : Seuil minimal de 70% requis pour valider le certificat officiel SGCI."
    ])

    # =========================================================================
    # SLIDE 6 : PROTOCOLE D'EVALUATION & TRIADE RAG
    # =========================================================================
    slide6 = prs.slides.add_slide(blank_layout)
    add_header(slide6, "5. Audit & Métriques de Validation Technique", "Évaluation rigoureuse de la qualité RAG via le framework Triade RAG")

    add_card(slide6, 0.6, 1.4, 3.8, 5.4, "🎯 1. Fidélité (Groundedness)", [
        "• Définition : Mesure si la réponse de l'IA est strictement étayée par les documents extraits.",
        "• Résultat T-chIA : 100.0%",
        "• Signification Métier : Zéro hallucination. L'IA ne formule aucune information en dehors du cadre réglementaire SGCI fourni."
    ], bg_color=RGBColor(240, 253, 244), border_color=RGBColor(134, 239, 172), title_color=COLOR_EMERALD)

    add_card(slide6, 4.7, 1.4, 3.8, 5.4, "💬 2. Pertinence Réponse (Answer Relevance)", [
        "• Définition : Mesure l'adéquation exacte entre la question posée par l'apprenant et la réponse générée.",
        "• Résultat T-chIA : 93.3%",
        "• Signification Métier : Réponses directes, concises et parfaitement alignées avec le besoin d'apprentissage."
    ], bg_color=RGBColor(239, 246, 255), border_color=RGBColor(147, 197, 253), title_color=RGBColor(37, 99, 235))

    add_card(slide6, 8.8, 1.4, 3.9, 5.4, "⚡ 3. Pertinence Contexte & Latence", [
        "• Pertinence Contexte : 88.3% (Qualité du chunking et du retrieval vectoriel).",
        "• Latence Retrieval : 223.5 ms (Recherche ChromaDB ultra-rapide).",
        "• Latence Totale : 3.88 s par requête (Génération fluide en situation de production)."
    ], bg_color=RGBColor(250, 245, 255), border_color=RGBColor(216, 180, 254), title_color=COLOR_PURPLE)

    # =========================================================================
    # SLIDE 7 : RESULTATS EXPERIMENTAUX & PERFORMANCES
    # =========================================================================
    slide7 = prs.slides.add_slide(blank_layout)
    add_header(slide7, "6. Résultats Expérimentaux & Dashboard d'Audit", "Données chiffrées issues du module d'évaluation automatique RAG Super Admin")

    add_card(slide7, 0.6, 1.4, 12.1, 5.4, "📊 Synthèse des Performances du Moteur RAG T-chIA", [
        "MÉTRIQUE AUDITÉE                     | SCORE OBTENU | SEUIL REQUIS | STATUT DE VALIDATION",
        "-------------------------------------|--------------|--------------|---------------------",
        "• Groundedness / Non-Hallucination   | 100.0 %      | 100.0 %      | ✅ CONFORME (Zéro Hallucination)",
        "• Global RAG Score                   | 93.9 %       | > 85.0 %     | ✅ EXCELLENT",
        "• Answer Relevance                   | 93.3 %       | > 85.0 %     | ✅ TRÈS PERTINENT",
        "• Context Relevance                  | 88.3 %       | > 80.0 %     | ✅ CONFORME",
        "• Retrieval Latency (ChromaDB)       | 223.5 ms     | < 500 ms      | ✅ HAUTE PERFORMANCE",
        "• Total Latency (End-to-End)         | 3.88 s       | < 5.00 s      | ✅ FLUIDE EN PRODUCTION",
        "",
        "💡 Conclusion de l'Audit : Le système offre une fiabilité totale sur les données privées de la SGCI, indispensable pour les cours de conformité et de réglementations bancaires."
    ], bg_color=COLOR_SLATE, border_color=COLOR_SLATE, title_color=COLOR_WHITE)

    # Re-color text inside slide 7 card to white/light slate for contrast
    for shape in slide7.shapes:
        if shape.has_text_frame and shape != slide7.shapes[0]: # not header
            for paragraph in shape.text_frame.paragraphs:
                paragraph.font.color.rgb = COLOR_WHITE
                paragraph.font.name = "Consolas"

    # =========================================================================
    # SLIDE 8 : PITCH DIRECTION INNOVATION (PVP)
    # =========================================================================
    slide8 = prs.slides.add_slide(blank_layout)
    add_header(slide8, "7. Pitch Direction Innovation : Proposition de Valeur", "Faire de la SGCI le leader de l'adoption raisonnée de l'IA Générative bancaire")

    add_card(slide8, 0.6, 1.4, 5.8, 5.4, "🚀 Accélération de la Transformation IA", [
        "• Pionnier sous-régional : Positionne la SGCI comme la première filiale bancaire de l'Afrique de l'Ouest à déployer un tuteur IA interactif RAG multimodal.",
        "• Agilité d'innovation : Capacité à transformer n'importe quel nouveau texte de loi ou circulaire bancaire en formation certifiante en < 2 minutes.",
        "• Souveraineté & Sécurité : Données confinées au tenant SGCI, contrôle strict des accès (RBAC), aucune réutilisation des données bancaires pour le réentraînement des modèles cloud."
    ], bg_color=RGBColor(240, 253, 244), border_color=RGBColor(134, 239, 172), title_color=COLOR_EMERALD)

    add_card(slide8, 6.8, 1.4, 5.8, 5.4, "💰 ROI & Efficacité Opérationnelle", [
        "• Réduction drastique des coûts : Suppression des frais d'ingénierie pédagogique externe et baisse des coûts logistiques présentiels.",
        "• Modèle d'architecture sobre : Stack basée sur Python, ChromaDB et Edge-TTS (composants open-source) combinée à Gemini Flash (coût API très faible).",
        "• Scalabilité immédiate : Déploiement sans friction auprès de l'ensemble des 2000+ collaborateurs SGCI sans dégradation de performance."
    ], bg_color=RGBColor(239, 246, 255), border_color=RGBColor(147, 197, 253), title_color=RGBColor(37, 99, 235))

    # =========================================================================
    # SLIDE 9 : COMPARAISON AVANT / APRES T-CHIA
    # =========================================================================
    slide9 = prs.slides.add_slide(blank_layout)
    add_header(slide9, "8. Analyse Comparative : Avant vs Après T-chIA", "Mesure de l'impact opérationnel et de la création de valeur")

    add_card(slide9, 0.6, 1.4, 5.8, 5.4, "❌ AVANT T-chIA (Processus Traditionnel)", [
        "• Temps de création : 3 semaines par formation (rédaction slides, quiz, narration).",
        "• Format d'apprentissage : Support PDF/PPTX statique, aucune assistance vocale.",
        "• Évaluation : QCM basique sans analyse qualitative des réponses.",
        "• Suivi de conformité : Tracking manuel des retards sur tableau Excel, risque d'échéance dépassée.",
        "• Engagement collaborateur : Faible taux de complétion sur les cours obligatoires."
    ], bg_color=RGBColor(254, 242, 242), border_color=RGBColor(252, 165, 165), title_color=COLOR_RED)

    add_card(slide9, 6.8, 1.4, 5.8, 5.4, "✅ APPRÈS T-chIA (Apprentissage Augmenté)", [
        "• Temps de création : < 2 minutes par formation (-95% de gain temporel).",
        "• Format d'apprentissage : Cours interactif avec tuteur vocal Edge-TTS et session Live IA.",
        "• Évaluation : Épreuve composite 70% QCM + 30% soutenance orale scorée par IA.",
        "• Suivi de conformité : Calcul automatique des 10 jours ouvrés CI, pings actifs (45s) et cockpit RH.",
        "• Engagement collaborateur : Expérience fluide, ludique et disponible 24/7."
    ], bg_color=RGBColor(240, 253, 244), border_color=RGBColor(134, 239, 172), title_color=COLOR_EMERALD)

    # =========================================================================
    # SLIDE 10 : MATRICE DES APPORTS PAR DIRECTION
    # =========================================================================
    slide10 = prs.slides.add_slide(blank_layout)
    add_header(slide10, "9. Matrice des Apports par Direction SGCI & Groupe", "Des bénéfices ciblés et mesurables pour chaque partie prenante bancaire")

    add_card(slide10, 0.6, 1.4, 12.1, 5.4, "🏢 Vue d'ensemble des Retombées Stratégiques & Opérationnelles", [
        "• DIRECTION DES RESSOURCES HUMAINES & SGCI ACADEMY : Gain de temps massif (-95%), pilotage des compétences en temps réel, zéro logistique lourde.",
        "• DIRECTION CONFORMITÉ, RISQUES & JURIDIQUE : Respect garanti du délai de 10 jours ouvrés bancaires CI, traçabilité des consentements RGPD, preuve d'auditabilité pour la BCEAO.",
        "• DIRECTION INFORMATIQUE (DSI) : Solution microservices moderne, facile à intégrer au SI SGCI, respect des normes de sécurité bancaire et RBAC.",
        "• DIRECTION COMMERCIALE & RÉSEAU D'AGENCES : Formation 'à chaud' des conseillers avant les RDV clients, flexibilité d'apprentissage sans fermer les guichets.",
        "• GROUPE SOCIÉTÉ GÉNÉRALE (AFMO / PARIS) : Standard réutilisable et industrialisable dans les filiales Afrique et au-delà."
    ], bg_color=COLOR_GRAY_BG, border_color=COLOR_BORDER)

    # =========================================================================
    # SLIDE 11 : FOCUS DRH & SGCI ACADEMY
    # =========================================================================
    slide11 = prs.slides.add_slide(blank_layout)
    add_header(slide11, "10. Focus DRH & SGCI Academy : Cockpit de Pilotage", "Un LXP / LMS bancaire complet avec suivi en temps réel et analytics")

    add_card(slide11, 0.6, 1.4, 5.8, 5.4, "📊 Espace Administrateur RH (6 Vues Analytics)", [
        "1. Vue d'ensemble : Taux de complétion, formations actives, moyenne des évaluations et téléchargements.",
        "2. Collaborateurs en ligne : Indicator dynamique des apprenants actifs au cours des 5 dernières min (Heartbeat 45s).",
        "3. Activité par formation : Métriques détaillées par cours (inscrits, complétés, note moyenne).",
        "4. Supports téléchargés : Suivi des consultations et téléchargements de PDF/PPTX.",
        "5. Timeline individuelle : Audit complet du parcours d'un collaborateur.",
        "6. Formations en retard : Alertes sur les dépassements du délai de 10j ouvrés."
    ])

    add_card(slide11, 6.8, 1.4, 5.8, 5.4, "📈 Export & Conduite du Changement", [
        "• Export CSV en un clic : Extraction complète des métriques pour alimenter les reportings de la DRH.",
        "• Parcours de certification normé : Valorisation des collaborateurs certifiés via des attestations de réussite.",
        "• Conduite du changement : Réduction de la résistance à la formation obligatoire grâce au format interactif et vocal."
    ])

    # =========================================================================
    # SLIDE 12 : FOCUS CONFORMITE & JURIDIQUE
    # =========================================================================
    slide12 = prs.slides.add_slide(blank_layout)
    add_header(slide12, "11. Focus Conformité, Risques & Sécurité", "Maîtrise du risque réglementaire, traçabilité RGPD et auditabilité BCEAO")

    add_card(slide12, 0.6, 1.4, 5.8, 5.4, "🛡️ Modal de Divulgation IA & Consentement RGPD", [
        "• Écran de consentement obligatoire lors de la première connexion.",
        "• Validation explicite de 3 engagements :",
        "  1. Usage strictly professionnel des outils IA.",
        "  2. Rôle d'assistance pédagogique de l'IA sans prise de décision disciplinaire automatique.",
        "  3. Non-divulgation de données client confidentielles (Secret bancaire).",
        "• Historisation horodatée dans la table `user_consents` (Audit Trail)."
    ])

    add_card(slide12, 6.8, 1.4, 5.8, 5.4, "⚖️ Garanties d'Auditabilité & Régulation", [
        "• Moteur RAG 100% Grounded : Garantie de non-hallucination évitant toute mauvaise interprétation des textes de loi.",
        "• Conduite des contrôles BCEAO : Preuve irréfutable de la réalisation des formations réglementaires dans le délai légal de 10 jours ouvrés.",
        "• Alignement AI Act & Standards Groupe SG : Transparence sur l'utilisation des modèles d'IA générative."
    ])

    # =========================================================================
    # SLIDE 13 : FOCUS DSI & RESEAU COMMERCIAL
    # =========================================================================
    slide13 = prs.slides.add_slide(blank_layout)
    add_header(slide13, "12. Focus DSI (Informatique) & Réseau Commercial", "Architecture logicielle robuste et valeur ajoutée pour les conseillers réseau")

    add_card(slide13, 0.6, 1.4, 5.8, 5.4, "💻 Synergie avec la DSI (Direction Informatique)", [
        "• Architecture Micro-services : Backend Flask/FastAPI découplé, facile à conteneuriser (Docker).",
        "• Sécurité & Contrôle d'Accès : RBAC à 3 niveaux (Super Admin, Admin RH, Apprenant), authentification sécurisée.",
        "• Indépendance logicielle : Stack ne nécessitant aucun composant lourd propriétaire payant."
    ])

    add_card(slide13, 6.8, 1.4, 5.8, 5.4, "🏦 Synergie avec le Réseau d'Agences Commerciales", [
        "• Formation à la carte / 'Just-in-Time' : Possibilité pour un conseiller d'interroger le tuteur IA sur une nouvelle offre produit avant son rendez-vous.",
        "• Réduction de l'absentéisme en agence : Fin des déplacements vers le siège pour les sessions de formation présentielle.",
        "• Montée en compétences accélérée : Apprentissage ludique et interactif à son propre rythme."
    ])

    # =========================================================================
    # SLIDE 14 : VISION STRATEGIQUE GROUPE SOCIETE GENERALE
    # =========================================================================
    slide14 = prs.slides.add_slide(blank_layout)
    add_header(slide14, "13. Vision Stratégique Groupe & Synergies AFMO", "Du succès SGCI vers un déploiement multi-filiales au sein du Groupe Société Générale")

    add_card(slide14, 0.6, 1.4, 12.1, 5.4, "🌍 Rayonnement & Scalabilité au sein du Groupe SG", [
        "1. DÉPLOIEMENT RÉGIONAL AFMO (AFRIQUE DE L'OUEST & CENTRALE)",
        "   • Déclinaison facile de la solution pour d'autres filiales du Groupe (SGCI, SGBCI, SGBS, etc.) avec adaptation des calendriers bancaires locaux.",
        "",
        "2. RÉUTILISATION DU MOTEUR RAG POUR D'AUTRES USAGES BANCAIRES",
        "   • Extension de T-chIA vers un assistant de recherche réglementaire 'Copilot Conseiller' pour accélérer le traitement des demandes clients en agence.",
        "",
        "3. VALORISATION DE L'INNOVATION AFRIQUE AU SEIN DU GROUPE",
        "   • Illustration concrète de la capacité d'innovation et de la maîtrise IA du hub SGCI Côte d'Ivoire auprès de la Direction Innovation Groupe à Paris."
    ], bg_color=COLOR_GRAY_BG, border_color=COLOR_BORDER)

    # =========================================================================
    # SLIDE 15 : LIMITES ET FEUILLE DE ROUTE (ROADMAP)
    # =========================================================================
    slide15 = prs.slides.add_slide(blank_layout)
    add_header(slide15, "14. Limites Actuelles & Feuille de Route d'Industrialisation", "Perspectives d'évolution technique et opérationnelle pour le passage à l'échelle")

    add_card(slide15, 0.6, 1.4, 5.8, 5.4, "⚠️ Limites Actuelles Identifiées", [
        "• Scalabilité de la Persistance : SQLite idéal pour la démonstration/POC mais nécessitant une transition vers PostgreSQL pour la haute charge en production.",
        "• Dépendance aux API Cloud : Utilisation de Gemini Cloud nécessitant une connexion internet stable.",
        "• Traitement des Médias Complexes : Extractions principalement axées sur le texte et les présentations (intégration future de l'OCR vidéo)."
    ], bg_color=RGBColor(254, 242, 242), border_color=RGBColor(252, 165, 165), title_color=COLOR_RED)

    add_card(slide15, 6.8, 1.4, 5.8, 5.4, "🗺️ Feuille de Route (Roadmap 2026-2027)", [
        "• Phase 1 (T4 2026) - Industrialisation DevOps : Conteneurisation Docker, CI/CD, migration SQLite -> PostgreSQL & ChromaDB Server / Qdrant.",
        "• Phase 2 (T1 2027) - Agents Autonomes Multi-RAG : Architecture multi-agents (Agent Quiz, Agent Tutor, Agent Compliance).",
        "• Phase 3 (T2 2027) - Application Mobile & Offline : Version mobile iOS/Android avec cache sémantique et mode hors-ligne."
    ], bg_color=RGBColor(240, 253, 244), border_color=RGBColor(134, 239, 172), title_color=COLOR_EMERALD)

    # =========================================================================
    # SLIDE 16 : CONCLUSION ET PRE-SOUTENANCE
    # =========================================================================
    slide16 = prs.slides.add_slide(blank_layout)
    bg16 = slide16.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    bg16.fill.solid()
    bg16.fill.fore_color.rgb = COLOR_SLATE
    bg16.line.fill.background()

    stripe16 = slide16.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(0.3), Inches(7.5))
    stripe16.fill.solid()
    stripe16.fill.fore_color.rgb = COLOR_RED
    stripe16.line.fill.background()

    tf16 = slide16.shapes.add_textbox(Inches(0.8), Inches(1.2), Inches(11.5), Inches(5.0)).text_frame
    tf16.word_wrap = True

    p = tf16.paragraphs[0]
    p.text = "CONCLUSION & REMERCIEMENTS"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = COLOR_RED
    p.space_after = Pt(15)

    p = tf16.add_paragraph()
    p.text = "T-chIA : L'Alliance Réussie de la Rigueur Académique et de la Valeur Métier Bancaire"
    p.font.size = Pt(24)
    p.font.bold = True
    p.font.color.rgb = COLOR_WHITE
    p.space_after = Pt(20)

    p = tf16.add_paragraph()
    p.text = "• MABIALA Bergin — Master 2 Data Science, Big Data & IA\n• Stage de Fin d'Études réalisé à la Société Générale Côte d'Ivoire (SGCI)\n\nMerci pour votre attention. Je suis à présent disponible pour répondre à vos questions."
    p.font.size = Pt(15)
    p.font.color.rgb = RGBColor(203, 213, 225)

    output_path = r"c:\Users\dicko\SGCI_2026_001\10_09_2026_001_bon_20_09_2026_009\Presentation_TchIA_SGCI_PreSoutenance_Innovation.pptx"
    prs.save(output_path)
    print(f"Presentation saved successfully at: {output_path}")

if __name__ == "__main__":
    create_presentation()
