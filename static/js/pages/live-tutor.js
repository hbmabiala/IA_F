// =========================================================================
// PAGE DETAILS / MODE 2 : INTERACTION DIRECTE AVEC L'AVATAR TUTEUR IA (LIVE)
// =========================================================================

// ==========================================
// MODE 2 : MODE INTERACTION DIRECTE (LIVE IA)
// ==========================================
// GESTION DU VOLET DOCUMENT MASQUÉ (À DROITE)
window.toggleCourseDocumentPanel = function(forceState) {
    const drawer = document.getElementById('course-document-drawer');
    const badge = document.getElementById('doc-badge-status');
    const toggleBtn = document.getElementById('toggle-doc-btn');
    if (!drawer) return;

    let isHidden = drawer.classList.contains('doc-drawer-hidden');
    let shouldShow = (typeof forceState === 'boolean') ? forceState : isHidden;

    if (shouldShow) {
        drawer.classList.remove('doc-drawer-hidden');
        if (badge) {
            badge.innerText = "Affiché";
            badge.style.background = "#000000";
        }
        if (toggleBtn) {
            toggleBtn.style.background = "#e9041e";
        }
        if (pdfDoc) {
            renderPage(pageNum || 1);
        }
    } else {
        drawer.classList.add('doc-drawer-hidden');
        if (badge) {
            badge.innerText = "Masqué";
            badge.style.background = "#334155";
        }
        if (toggleBtn) {
            toggleBtn.style.background = "#0f172a";
        }
    }
};

// GESTION DE L'HOLOGRAMME ET DE SON ÉTAT
window.setHologramState = function(state, text) {
    const vp = document.getElementById('hologram-viewport');
    const pill = document.getElementById('holo-status-pill');
    const statusText = document.getElementById('holo-status-text');
    const speechContent = document.getElementById('holo-speech-content');
    const actionBtn = document.getElementById('holo-action-btn');

    if (vp) vp.classList.remove('holo-speaking', 'holo-listening');

    if (state === 'speaking') {
        if (vp) vp.classList.add('holo-speaking');
        if (pill) {
            pill.className = 'holo-status-idle';
            pill.style.borderColor = '#e9041e';
            pill.style.background = '#fee2e2';
            pill.style.color = '#e9041e';
        }
        if (statusText) statusText.innerText = "T-chIA s'exprime...";
        if (text && speechContent) {
            speechContent.innerText = `« ${text} »`;
        } else if (speechContent) {
            if (window.liveSessionTerminating) {
                speechContent.innerText = "« Clôture de la formation et au revoir... »";
            } else if (window.livePresentationReachedEnd) {
                speechContent.innerText = "« Synthèse finale et réponses à vos questions... »";
            } else {
                const sNum = window.currentLiveSlide || pageNum || 1;
                const total = window.liveTotalSlides || 1;
                speechContent.innerText = `« Échange en cours avec votre formateur (Étape ${sNum}/${total})... »`;
            }
        }
    } else if (state === 'listening') {
        if (vp) vp.classList.add('holo-listening');
        if (pill) {
            pill.className = 'holo-status-idle';
            pill.style.borderColor = '#000000';
            pill.style.background = '#f1f5f9';
            pill.style.color = '#000000';
        }
        if (statusText) statusText.innerText = "À votre écoute...";
        if (speechContent) {
            if (window.livePresentationReachedEnd) {
                speechContent.innerText = "« Avez-vous des questions sur l'ensemble de la formation ? Je suis à votre écoute. »";
            } else {
                speechContent.innerText = "« Je vous écoute... Posez votre question ou intervenez à tout moment. »";
            }
        }
    } else if (state === 'connecting') {
        if (statusText) statusText.innerText = "Connexion à T-chIA...";
        if (actionBtn) actionBtn.innerText = "Connexion...";
    } else { // idle
        if (pill) {
            pill.className = 'holo-status-idle';
            pill.style.borderColor = '#cbd5e1';
            pill.style.background = '#f1f5f9';
            pill.style.color = '#0f172a';
        }
        if (statusText) statusText.innerText = isConnected ? "T-chIA actif (Prêt)" : "T-chIA en veille";
        if (actionBtn) {
            actionBtn.innerText = isConnected ? "Mettre en pause la discussion" : "Lancer la formation interactive";
        }
    }
};

window.toggleHologramDiscussion = async function() {
    if (isConnected) {
        disconnect();
        setHologramState('idle');
    } else {
        setHologramState('connecting');
        await connect();
    }
};

// GESTION DU BOUTON ÉVALUATION EN MODE LIVE (GRISÉ TANT QUE NON SUIVIE)
function updateLiveEvalBtnState(hasCompleted) {
    const evalBtn = document.getElementById('detail-eval-btn');
    if (!evalBtn) return;
    if (hasCompleted) {
        evalBtn.disabled = false;
        evalBtn.style.background = '#e9041e';
        evalBtn.style.color = '#ffffff';
        evalBtn.style.cursor = 'pointer';
        evalBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.25)';
        evalBtn.style.opacity = '1';
        evalBtn.title = "Tester et valider vos connaissances";
        evalBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Passer l'évaluation`;
    } else {
        evalBtn.disabled = true;
        evalBtn.style.background = '#cbd5e1';
        evalBtn.style.color = '#64748b';
        evalBtn.style.cursor = 'not-allowed';
        evalBtn.style.boxShadow = 'none';
        evalBtn.style.opacity = '0.85';
        evalBtn.title = "Veuillez suivre la formation jusqu'au bout pour débloquer l'évaluation";
        evalBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Évaluation verrouillée`;
    }
}
window.updateLiveEvalBtnState = updateLiveEvalBtnState;

function startLiveTutorMode(id) {
    const course = courses.find(c => c.id == id);
    if (!course) return;
    
    currentCourse = course;
    try {
        sessionStorage.setItem('ia_formation_course_id', id);
        sessionStorage.setItem('ia_formation_course_mode', 'live');
        sessionStorage.setItem('ia_formation_current_page', 'details');
        localStorage.setItem('ia_formation_course_id', id);
        localStorage.setItem('ia_formation_course_mode', 'live');
        localStorage.setItem('ia_formation_current_page', 'details');
    } catch (e) {}

    // Si on n'est pas sur la page dédiée /details, rediriger immédiatement
    const detailsPage = document.getElementById('page-details');
    if (!detailsPage) {
        window.location.href = '/details?course_id=' + id;
        return;
    }
    
    // Griser le bouton d'évaluation si la formation n'est pas encore suivie
    const hasFollowed = Boolean(course.has_completed_training || course.user_evaluation);
    updateLiveEvalBtnState(hasFollowed);
    window.liveTotalSlides = (course.slides_data && Array.isArray(course.slides_data) && course.slides_data.length > 0) ? course.slides_data.length : 1;
    window.currentLiveSlide = 1;
    window.livePresentationReachedEnd = false;
    window.finalQuestionsPromptSent = false;
    window.liveSessionTerminating = false;
    window.isDisconnectingGracefully = false;
    window.silenceCounter = 0;
    window.isTutorPaused = false;
    window.userInterrupted = false;
    window.userAskingQuestion = false;
    window.isModelTurnComplete = false;
    if (window.advanceSlideTimeout) {
        clearTimeout(window.advanceSlideTimeout);
        window.advanceSlideTimeout = null;
    }
    
    const detailTitle = document.getElementById('detail-title');
    if (detailTitle) detailTitle.innerText = course.title;
    const detailTags = document.getElementById('detail-tags');
    if (detailTags) {
        detailTags.innerHTML = '';
    }
    
    // Configurer les téléchargements PDF et PPTX
    const dlPdf = document.getElementById('detail-download-pdf');
    const miniDlPdf = document.getElementById('mini-download-pdf');
    if (course.pdf_url) {
        const downloadUrl = `/api/courses/${course.id}/download/pdf${currentUser ? '?user_id=' + currentUser.id : ''}`;
        if (dlPdf) {
            dlPdf.href = downloadUrl;
            dlPdf.style.display = 'inline-flex';
            dlPdf.onclick = () => { if (typeof trackDocumentDownload === 'function') trackDocumentDownload(course.id, 'PDF'); };
        }
        if (miniDlPdf) {
            miniDlPdf.href = downloadUrl;
            miniDlPdf.style.display = 'inline-flex';
            miniDlPdf.onclick = () => { if (typeof trackDocumentDownload === 'function') trackDocumentDownload(course.id, 'PDF'); };
        }
    } else {
        if (dlPdf) dlPdf.style.display = 'none';
        if (miniDlPdf) miniDlPdf.style.display = 'none';
    }

    const dlPptx = document.getElementById('detail-download-pptx');
    if (course.pptx_url) {
        const downloadPptxUrl = `/api/courses/${course.id}/download/pptx${currentUser ? '?user_id=' + currentUser.id : ''}`;
        if (dlPptx) {
            dlPptx.href = downloadPptxUrl;
            dlPptx.style.display = 'inline-flex';
            dlPptx.onclick = () => { if (typeof trackDocumentDownload === 'function') trackDocumentDownload(course.id, 'PPTX'); };
        }
    } else {
        if (dlPptx) dlPptx.style.display = 'none';
    }

    // Le document reste MASQUÉ par défaut
    toggleCourseDocumentPanel(false);

    // Initialiser l'hologramme en veille active
    setHologramState('idle');
    const speechBox = document.getElementById('holo-speech-content');
    if (speechBox) {
        const tutorDisplayName = course.tutor_name ? `${course.tutor_name}, votre formateur` : "votre formateur";
        speechBox.innerText = `« Bonjour ! Je suis ${tutorDisplayName} pour la formation "${course.title}". Cliquez ci-dessus pour lancer notre échange en direct. »`;
    }
    
    // Initialiser le sélecteur de vitesse de l'IA Live
    const liveSpeedSelect = document.getElementById('live-speed-select');
    if (liveSpeedSelect) {
        liveSpeedSelect.value = String(currentLiveTutorSpeed);
    }

    // Si l'IA live était connectée, réinitialisation
    if (isConnected) {
        disconnect();
    }
    
    // Charger le PDF en arrière-plan pour la miniature
    if (course.pdf_url) {
        const url = course.pdf_url;
        pdfjsLib.getDocument(url).promise.then(doc => {
            pdfDoc = doc;
            const countEl = document.getElementById('page-count');
            if (countEl) countEl.textContent = doc.numPages;
            if (!window.liveTotalSlides || window.liveTotalSlides <= 1) {
                window.liveTotalSlides = doc.numPages;
            }
            pageNum = 1;
            window.currentLiveSlide = 1;
            renderPage(1);
        }).catch(err => {
            console.error("Erreur chargement PDF", err);
        });
    }
    
    window.navigateTo('details');
}
window.startLiveTutorMode = startLiveTutorMode;

function renderPage(num) {
    if (!pdfDoc) return;
    pdfDoc.getPage(num).then(page => {
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({scale: 1.5});
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({ canvasContext: ctx, viewport: viewport });
        const pageNumEl = document.getElementById('page-num');
        if (pageNumEl) pageNumEl.textContent = num;
    });
}

const prevBtn = document.getElementById('prev-slide');
if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        if (pageNum <= 1) return;
        pageNum--;
        window.currentLiveSlide = pageNum;
        renderPage(pageNum);
    });
}

const nextBtn = document.getElementById('next-slide');
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        window.currentLiveSlide = pageNum;
        renderPage(pageNum);
    });
}


// --- WEBSOCKET GEMINI LIVE & AUDIO WEBRTC ---
// --- INTELLIGENCE ARTIFICIELLE (GEMINI WEBSOCKET) ---
let ws = null;
let isConnected = false;
let audioStream = null;
let processor = null;
let gainNode = null;
let recordingContext = null;
let playbackContext = null;
let nextPlayTime = 0;

function getGeminiApiKey() {
    return (window.config && window.config.GEMINI_API_KEY) ? window.config.GEMINI_API_KEY : '';
}

const micBtn = document.getElementById('mic-btn');

if (micBtn) {
    micBtn.addEventListener('click', async () => {
        const currentKey = getGeminiApiKey();
        if (!currentKey || currentKey === 'votre_cle_api_gemini_ici') {
            alert("Veuillez configurer votre clé API GEMINI_API_KEY dans l'environnement du serveur.");
            return;
        }

        if (isConnected) {
            disconnect();
        } else {
            await connect();
        }
    });
}

function getCurrentPageContext() {
    const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
    const path = (window.location.pathname || '').replace(/^\//, '').trim();
    const isDashboardActive = path === 'dashboard' || path === '' || document.getElementById('page-dashboard')?.classList.contains('active');
    const isDetailsActive = path === 'details' || document.getElementById('page-details') !== null;
    const isConsultationActive = path === 'catalogue' || path === 'consultation' || document.getElementById('page-consultation')?.classList.contains('active');
    const isUsersActive = path === 'users' || document.getElementById('page-users')?.classList.contains('active');
    const isAssignmentsActive = path === 'assignments' || document.getElementById('page-assignments')?.classList.contains('active');
    const isCreationActive = path === 'creation' || document.getElementById('page-creation')?.classList.contains('active');

    if (isDetailsActive && currentCourse) {
        return {
            type: 'course_tutor',
            idleText: `Tuteur IA : ${currentCourse.title || 'Cours'}`,
            connectedText: 'Arrêter le Tuteur',
            connectingText: 'Connexion Tuteur...'
        };
    } else if (isDashboardActive && isAdminOrSuper) {
        return {
            type: 'admin_dashboard',
            idleText: 'Analyse du TB Admin',
            connectedText: 'Arrêter Analyse TB',
            connectingText: 'Connexion Analyse TB...'
        };
    } else if (isDashboardActive && !isAdminOrSuper) {
        return {
            type: 'user_dashboard',
            idleText: 'Mon Suivi Formation',
            connectedText: 'Déconnecter Suivi',
            connectingText: 'Connexion Suivi...'
        };
    } else if (isDetailsActive && currentCourse) {
        return {
            type: 'course_tutor',
            idleText: `Tuteur IA : ${currentCourse.title || 'Cours'}`,
            connectedText: 'Arrêter le Tuteur',
            connectingText: 'Connexion Tuteur...'
        };
    } else if (isConsultationActive) {
        return {
            type: 'catalog',
            idleText: ' Guide du Catalogue',
            connectedText: 'Déconnecter Guide',
            connectingText: 'Connexion Guide...'
        };
    } else if (isAssignmentsActive) {
        return {
            type: 'assignments',
            idleText: 'Assistant Parcours & Assignations',
            connectedText: 'Déconnecter Assistant',
            connectingText: 'Connexion Assistant...'
        };
    } else if (isUsersActive) {
        return {
            type: 'users',
            idleText: 'Assistant Gestion Utilisateurs',
            connectedText: 'Déconnecter Assistant',
            connectingText: 'Connexion Assistant...'
        };
    } else if (isCreationActive) {
        return {
            type: 'creation',
            idleText: 'Assistant Création de Cours',
            connectedText: 'Déconnecter Assistant',
            connectingText: 'Connexion Assistant...'
        };
    }

    return {
        type: 'default',
        idleText: 'Assistant IA Live',
        connectedText: 'Déconnecter IA',
        connectingText: 'Connexion...'
    };
}

function updateAssistantButtonUI() {
    const aiAssistant = document.getElementById('ai-assistant');
    const isDetailsActive = document.getElementById('page-details')?.classList.contains('active');
    if (isDetailsActive) {
        if (aiAssistant) aiAssistant.style.display = 'none';
        return;
    } else if (currentUser && aiAssistant) {
        aiAssistant.style.display = 'block';
    }

    const btn = document.getElementById('mic-btn');
    if (!btn) return;
    const ctx = getCurrentPageContext();
    if (isConnected) {
        btn.className = 'btn-listening';
        btn.innerText = ctx.connectedText;
    } else {
        btn.className = 'btn-idle';
        btn.innerText = ctx.idleText;
    }
}

function getSlideTeachingPayload(slideNum) {
    if (!currentCourse) return { title: 'Général', bullets: '', narration: '' };
    const slides = Array.isArray(currentCourse.slides_data) ? currentCourse.slides_data : [];
    const scriptList = Array.isArray(currentCourse.script) ? currentCourse.script : [];
    const idx = Math.max(0, slideNum - 1);
    const s = slides[idx] || {};
    const title = s.titre || `Partie ${slideNum}`;
    const bullets = (s.puces && Array.isArray(s.puces)) ? s.puces.join(' ; ') : '';
    const narration = scriptList[idx] || s.narration || '';
    return { title, bullets, narration };
}

async function connect() {
    const pageCtx = getCurrentPageContext();
    try {
        recordingContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        nextPlayTime = playbackContext.currentTime;
        if (micBtn) micBtn.innerText = pageCtx.connectingText;
    } catch (e) {
        console.error(e);
        resetUI();
        return;
    }

    const activeApiKey = getGeminiApiKey();
    if (!activeApiKey) {
        alert("Clé API Gemini non configurée dans l'environnement du serveur.");
        resetUI();
        return;
    }

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${activeApiKey}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        let systemPrompt = `Tu es l'assistant IA de l'application 'IA Formation'. Discute avec l'utilisateur, réponds à ses questions de manière naturelle et aide-le.`;
        let welcomeMsg = "Bonjour ! Accueille-moi brièvement sur l'application 'IA Formation' et demande-moi comment tu peux m'aider.";

        if (pageCtx.type === 'admin_dashboard') {
            // Mode Tableau de Bord Administrateur : interaction exclusive sur les données du dashboard
            const dashboardData = getAdminDashboardSummaryJson();
            const dashboardJsonString = JSON.stringify(dashboardData, null, 2);

            systemPrompt = `Tu es l'analyste officiel et expert vocal du Tableau de Bord Administrateur de l'application 'IA Formation'.
L'administrateur (${dashboardData.utilisateur_connecte.nom_complet}) se trouve actuellement sur la page "Tableau de Bord Administrateur".

DONNÉES EN TEMPS RÉEL DU TABLEAU DE BORD (JSON) :
${dashboardJsonString}

CONSIGNES STRICTES POUR TON INTERACTION VOCALE :
1. TON RÔLE : Tu es l'analyste du Tableau de Bord Administrateur. Ton interaction porte STRICTEMENT et UNIQUEMENT sur le contenu, les indicateurs clés et les formations de ce tableau de bord.
2. ÉLÉMENTS CLÉS À DÉCRIRE :
   - Nombre total de formations : ${dashboardData.kpis_principaux.total_formations}
   - Volume horaire total : ${dashboardData.kpis_principaux.volume_horaire_total_heures} heures
   - Domaines différents : ${dashboardData.kpis_principaux.domaines_differents_count}
   - Répartition détaillée par niveau : Débutant (${dashboardData.repartition_par_niveau['Débutant']}), Intermédiaire (${dashboardData.repartition_par_niveau['Intermédiaire']}), Avancé (${dashboardData.repartition_par_niveau['Avancé']})
   - Répartition par domaine : ${Object.entries(dashboardData.formations_par_domaine).map(([d, c]) => `${d} (${c})`).join(', ') || 'Aucun domaine pour le moment'}
3. PÉRIMÈTRE EXCLUSIF : Ne parle que de ce tableau de bord, de ces statistiques et de ces formations. Si l'administrateur te pose une question générale hors de propos, recentre poliment sur l'analyse de ce dashboard.
4. ÉLOCUTION ORALE : Sois concis, direct, vivant et très clair. Parle naturellement comme un collègue analyste qui commente le tableau de bord à l'oral.
5. ENGAGEMENT : Termine ton accueil en invitant l'administrateur à te demander des précisions sur un indicateur ou sur le catalogue.`;

            welcomeMsg = "Bonjour ! Présente-moi et décris de manière synthétique et vivante tous les chiffres clés du tableau de bord administrateur affiché.";

        } else if (pageCtx.type === 'course_tutor' && currentCourse) {
            let slides = Array.isArray(currentCourse.slides_data) ? currentCourse.slides_data : [];
            let scriptList = Array.isArray(currentCourse.script) ? currentCourse.script : [];
            let totalSlides = slides.length || (pdfDoc ? pdfDoc.numPages : 1);
            window.liveTotalSlides = totalSlides;
            window.currentLiveSlide = 1;
            window.livePresentationReachedEnd = false;
            window.finalQuestionsPromptSent = false;
            window.liveSessionTerminating = false;
            window.isDisconnectingGracefully = false;
            window.silenceCounter = 0;
            window.isTutorPaused = false;
            window.userInterrupted = false;
            window.userAskingQuestion = false;
            window.isModelTurnComplete = false;
            if (window.advanceSlideTimeout) {
                clearTimeout(window.advanceSlideTimeout);
                window.advanceSlideTimeout = null;
            }

            let formattedSteps = [];
            for (let idx = 0; idx < totalSlides; idx++) {
                const s = slides[idx] || {};
                const scriptText = scriptList[idx] || s.narration || '';
                const title = s.titre || `Partie ${idx + 1}`;
                const bullets = (s.puces && Array.isArray(s.puces)) ? s.puces.join(' ; ') : '';
                formattedSteps.push(`### Étape ${idx + 1} sur ${totalSlides} : ${title}
- Points clés du support visuel : ${bullets || 'Non spécifiés'}
- Trame narrative préparée : ${scriptText || 'Non spécifiée'}`);
            }
            const courseGuideText = formattedSteps.join('\n\n');
            
            const tutorLiveName = currentCourse.tutor_name || 'votre formateur';
            systemPrompt = `Tu t'appelles ${tutorLiveName}, formateur d'entreprise d'élite à la Société Générale Côte d'Ivoire (SGCI), expert passionné, chaleureux, bienveillant et pédagogue.
Tu es en direct pour dispenser vocalement l'intégralité de la formation officielle "${currentCourse.title}" à l'apprenant en tête-à-tête.

STRUCTURE ET CONTENU OFFICIEL DU COURS (À DISPENSER ÉTAPE PAR ÉTAPE) :
Pour chaque étape (de 1 à ${totalSlides}), tu disposes à la fois des points clés du support visuel et de la trame narrative audio préparée. Ton rôle est de faire le matching parfait entre les deux pour délivrer une explication riche, claire et vivante :

${courseGuideText}

RÈGLES D'OR DE TON COMPORTEMENT (100% HUMAIN, RÉACTIF ET PÉDAGOGIQUE) :

1. DISPENSATION NATURELLE ET INTERDICTION DE PARLER DE DIAPOSITIVE OU DE LIRE DES NOTES :
   - Tu es un véritable formateur en face-à-face. L'apprenant NE DOIT JAMAIS avoir l'impression que tu lis un document ou des notes préparées.
   - INTERDICTION STRICTE ET FORMELLE de prononcer les mots : "diapositive", "slide", "diapo", "transparent", "écran", "sur cette image", "comme vous le voyez", "notes", "puces".
   - Tu t'exprimes avec TES PROPRES MOTS, des métaphores parlantes et des exemples concrets du secteur bancaire, en suivant fidèlement la trame et les concepts de l'étape en cours.
   - Synchronisation visuelle discrète : à chaque nouvelle étape abordée, appelle l'outil \`changeSlide\` avec le numéro correspondant (\`slideNumber\`) pour afficher le support à l'apprenant sans jamais le mentionner à l'oral.

2. ÉCOUTE ACTIVE, RÉPONSE AUX QUESTIONS ET GESTION DES INTERRUPTIONS :
   - L'apprenant est libre d'interrompre et de poser une question à tout moment pendant ton explication.
   - DÈS QUE L'APPRENANT PREND LA PAROLE : ARRÊTE-TOI IMMÉDIATEMENT. Ne poursuis pas ton explication.
   - Écoute sa question avec attention et bienveillance.
   - Réponds de manière précise, concrète et humaine à son interrogation en t'appuyant sur ton expertise.
   - Après ta réponse, demande brièvement : "Est-ce que c'est plus clair pour vous ? Souhaitez-vous qu'on reprenne la suite du cours ?".
   - Dès que l'apprenant confirme qu'il a compris ou souhaite continuer, reprends immédiatement la formation là où elle s'était arrêtée.

3. GESTION DES ORDRES D'ARRÊT ET DE PAUSE :
   - Si l'apprenant te demande de t'arrêter ou de faire une pause ("arrête-toi", "stop", "attends", "pause", "une minute") :
     * Appelle immédiatement l'outil \`pauseCourse\`.
     * Confirme très brièvement avec chaleur : "Bien sûr, je me mets en pause. Prenez votre temps, dites-moi simplement 'on reprend' ou 'continue' quand vous êtes prêt."
     * Tais-toi complètement. Ne reprends pas la parole de toi-même tant qu'il ne t'a pas invité expressément à reprendre.
   - Dès qu'il dit "on reprend", "c'est bon", "continue" :
     * Appelle l'outil \`resumeCourse\` et continue la formation.

4. PROGRESSION CONTINUE ET CONCLUSION DE LA FORMATION :
   - Tu dispenses chaque étape du cours l'une après l'autre, de l'étape 1 à l'étape ${totalSlides}.
   - À la dernière étape, après avoir expliqué les notions, propose une courte synthèse chaleureuse et demande à l'apprenant s'il a des questions sur l'ensemble de la formation.
   - Dès qu'il n'y a plus de questions et que la session est terminée, remercie-le chaleureusement et appelle l'outil \`finishTrainingSession\` pour clore la formation et déverrouiller son évaluation.

5. LANGUE STRICTEMENT FRANÇAISE :
   - Tout l'échange se déroule EXCLUSIVEMENT en Français.
   - En cas d'incompréhension ou de bruit, NE DEMANDE JAMAIS S'IL FAUT CHANGER DE LANGUE. Demande poliment en français : "Pardonnez-moi, je n'ai pas bien saisi votre question, pouvez-vous me la répéter s'il vous plaît ?".`;
            
            const p1 = getSlideTeachingPayload(1);
            welcomeMsg = `Bonjour ! Je démarre notre session de formation sur "${currentCourse.title}". Accueille-moi chaleureusement en une phrase, puis commence immédiatement à dispenser la première partie du cours en appelant changeSlide(1) et en expliquant de manière vivante son contenu sans jamais prononcer le mot diapositive :
Thème : "${p1.title}"
Notions clés du support : "${p1.bullets}"
Trame préparée : "${p1.narration}"`;

        } else if (pageCtx.type === 'catalog') {
            const courseTitles = (courses || []).map(c => `"${c.title}" (${c.domain || 'Général'}, ${c.duration || 0}h, ${c.level || 'Débutant'})`).join(', ');
            systemPrompt = `Tu es le Guide du Catalogue de formations de l'application 'IA Formation'.
Voici les formations actuellement disponibles dans le catalogue : ${courseTitles || 'Aucune formation pour le moment'}.
Aide l'utilisateur à découvrir les formations, conseille-le selon ses besoins et ses centres d'intérêt, avec clarté et bienveillance.`;
            welcomeMsg = "Bonjour ! Présente-moi le catalogue de formations et demande-moi quel domaine ou sujet m'intéresse.";

        } else if (pageCtx.type === 'assignments') {
            systemPrompt = `Tu es l'assistant expert des Parcours Pédagogiques et Assignations de l'application 'IA Formation'.
Tu conseilles l'administrateur sur la création des règles d'attribution automatique et le ciblage des collaborateurs selon leur direction, poste ou statut de contrat.`;
            welcomeMsg = "Bonjour ! Comment puis-je vous assister dans la configuration de vos parcours et assignations de formation ?";

        } else if (pageCtx.type === 'users') {
            const usersSummary = (window.allUsers || []).map(u => ({
                matricule: u.matricule,
                nom_complet: `${u.nom || ''} ${u.prenom || ''}`.trim(),
                direction: u.direction || 'Non définie',
                poste: u.poste || 'Non défini',
                role: u.role,
                statut_contrat: u.statut_contrat || 'CDI',
                cours_assignes: u.assigned_courses_count || 0
            }));
            systemPrompt = `Tu es l'assistant expert de la Gestion des Utilisateurs de l'application 'IA Formation'.
L'administrateur se trouve sur le Répertoire des Utilisateurs (${usersSummary.length} utilisateurs enregistrés).

DONNÉES EN TEMPS RÉEL DES UTILISATEURS (JSON) :
${JSON.stringify(usersSummary, null, 2)}

CONSIGNES :
1. Aide l'administrateur à consulter l'annuaire des collaborateurs et leurs profils.
2. Réponds précisément sur le nombre d'utilisateurs, leurs rôles (Admin, Apprenant, Super Admin), leurs directions, postes et contrats.
3. Sois concis, clair et professionnel à l'oral.`;

            welcomeMsg = `Bonjour ! Je peux vous aider à parcourir l'annuaire des ${usersSummary.length} collaborateurs ou répondre à vos questions sur leurs profils. Que souhaitez-vous savoir ?`;

        } else if (pageCtx.type === 'user_dashboard') {
            const assignedCourses = (courses || []).filter(c => c.is_assigned);
            systemPrompt = `Tu es le coach d'apprentissage personnel de l'utilisateur sur 'IA Formation'.
L'utilisateur a ${assignedCourses.length} formation(s) assignée(s) : ${assignedCourses.map(c => c.title).join(', ') || 'Aucune formation assignée pour le moment'}.
Encourage-le et réponds à ses questions sur son parcours personnel.`;
            welcomeMsg = "Bonjour ! Résume-moi mes formations assignées et comment je peux progresser.";
        }
        
        // Résolution de la voix du formateur pour Gemini Live (garantit la même voix que le cours)
        let liveVoiceName = "Puck";
        if (pageCtx.type === 'course_tutor' && currentCourse) {
            if (currentCourse.gemini_voice) {
                liveVoiceName = currentCourse.gemini_voice;
            } else {
                const v = (currentCourse.tutor_voice || '').toLowerCase();
                if (v === 'sophie' || v.includes('denise')) liveVoiceName = "Aoede";
                else if (v === 'marc' || v.includes('remy')) liveVoiceName = "Fenrir";
                else if (v === 'camille' || v.includes('vivienne')) liveVoiceName = "Kore";
                else liveVoiceName = "Puck";
            }
        }

        let setupData = {
            model: "models/gemini-3.1-flash-live-preview",
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: liveVoiceName
                        }
                    }
                }
            }
        };

        if (pageCtx.type === 'course_tutor') {
            setupData.tools = [
                {
                    functionDeclarations: [
                        {
                            name: "changeSlide",
                            description: "Synchronise discrètement l'affichage visuel de l'apprenant sur l'étape du cours correspondante (commence à 1). À appeler à chaque nouveau thème abordé.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    slideNumber: {
                                        type: "INTEGER",
                                        description: "Numéro de l'étape en cours d'explication (commence à 1)"
                                    },
                                    isLastSlide: {
                                        type: "BOOLEAN",
                                        description: "Vrai s'il s'agit de la dernière étape ou conclusion"
                                    }
                                },
                                required: ["slideNumber"]
                            }
                        },
                        {
                            name: "pauseCourse",
                            description: "Met la formation en pause lorsque l'apprenant le demande ('pause', 'arrête-toi', 'attends', 'stop').",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    reason: {
                                        type: "STRING",
                                        description: "Raison de la pause"
                                    }
                                }
                            }
                        },
                        {
                            name: "resumeCourse",
                            description: "Reprend la formation après une pause lorsque l'apprenant indique qu'il est prêt ('continue', 'on reprend', 'c'est bon').",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    resumeSlide: {
                                        type: "INTEGER",
                                        description: "Numéro de l'étape à reprendre"
                                    }
                                }
                            }
                        },
                        {
                            name: "finishTrainingSession",
                            description: "À appeler dès que toute la formation et la présentation sont terminées et qu'il n'y a plus de questions de l'apprenant pour clore la formation et te déconnecter.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    reason: {
                                        type: "STRING",
                                        description: "Raison de la clôture (ex: 'formation_terminee')"
                                    }
                                }
                            }
                        }
                    ]
                }
            ];
        }

        ws.send(JSON.stringify({ setup: setupData }));
        ws.welcomeMessage = welcomeMsg;
    };

    ws.onmessage = async (event) => {
        let textData = event.data;
        if (textData instanceof Blob) {
            textData = await textData.text();
        }

        let msg;
        try {
            msg = JSON.parse(textData);
        } catch (e) { return; }

        if (msg.setupComplete) {
            isConnected = true;
            if (micBtn) {
                micBtn.className = 'btn-listening';
                micBtn.innerText = pageCtx.connectedText;
            }
            startRecording();
            
            ws.send(JSON.stringify({
                clientContent: {
                    turns: [{
                        role: "user",
                        parts: [{ text: ws.welcomeMessage }]
                    }],
                    turnComplete: true
                }
            }));
            
        } else if (msg.toolCall) {
            const calls = msg.toolCall.functionCalls || [];
            const functionResponses = [];
            for (let call of calls) {
                if (call.name === 'changeSlide') {
                    const page = call.args ? Number(call.args.slideNumber) : 1;
                    if (page && page > 0) {
                        window.currentLiveSlide = page;
                        pageNum = page;
                        renderPage(page);
                    }
                    if (call.args && call.args.isLastSlide) {
                        window.livePresentationReachedEnd = true;
                    }
                    functionResponses.push({
                        id: call.id,
                        response: { output: { success: true, currentPage: window.currentLiveSlide || page } }
                    });
                } else if (call.name === 'pauseCourse') {
                    window.isTutorPaused = true;
                    if (window.advanceSlideTimeout) {
                        clearTimeout(window.advanceSlideTimeout);
                        window.advanceSlideTimeout = null;
                    }
                    stopAudioPlayback();
                    if (typeof setHologramState === 'function') {
                        setHologramState('idle', 'Formation en pause à votre demande. Dites "continue" ou "on reprend" quand vous êtes prêt.');
                    }
                    functionResponses.push({
                        id: call.id,
                        response: { output: { success: true, paused: true } }
                    });
                } else if (call.name === 'resumeCourse') {
                    window.isTutorPaused = false;
                    window.userInterrupted = false;
                    window.userAskingQuestion = false;
                    const resumePage = (call.args && call.args.resumeSlide) ? Number(call.args.resumeSlide) : (window.currentLiveSlide || 1);
                    if (resumePage && resumePage > 0) {
                        window.currentLiveSlide = resumePage;
                        pageNum = resumePage;
                        renderPage(resumePage);
                    }
                    functionResponses.push({
                        id: call.id,
                        response: { output: { success: true, resumedSlide: window.currentLiveSlide } }
                    });
                } else if (call.name === 'finishTrainingSession') {
                    window.livePresentationReachedEnd = true;
                    window.liveSessionTerminating = true;
                    if (typeof handlePresentationCompleted === 'function') {
                        handlePresentationCompleted();
                    }
                    if (currentCourse) {
                        currentCourse.has_completed_training = true;
                        updateLiveEvalBtnState(true);
                    }
                    functionResponses.push({
                        id: call.id,
                        response: { output: { success: true, status: "terminating" } }
                    });
                    scheduleGracefulDisconnect();
                } else {
                    functionResponses.push({
                        id: call.id,
                        response: { output: { success: true } }
                    });
                }
            }
            if (ws && ws.readyState === WebSocket.OPEN && functionResponses.length > 0) {
                ws.send(JSON.stringify({
                    toolResponse: {
                        functionResponses: functionResponses
                    }
                }));
            }
        } else if (msg.serverContent) {
            if (msg.serverContent.interrupted) {
                console.log("[Gemini Live] Interruption détectée par le serveur : coupure audio immédiate");
                stopAudioPlayback();
                if (window.advanceSlideTimeout) {
                    clearTimeout(window.advanceSlideTimeout);
                    window.advanceSlideTimeout = null;
                }
                window.userInterrupted = true;
                window.userAskingQuestion = true;
            }
            if (msg.serverContent.modelTurn && msg.serverContent.modelTurn.parts) {
                window.isModelTurnComplete = false;
                const parts = msg.serverContent.modelTurn.parts;
                for (let part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        playAudioChunk(part.inlineData.data);
                    }
                    if (part.text) {
                        const lt = part.text.toLowerCase();
                        if (lt.includes("conclut notre") || lt.includes("fin de notre formation") || lt.includes("résume l'essentiel de notre parcours") || lt.includes("terminé notre présentation")) {
                            window.livePresentationReachedEnd = true;
                        }
                    }
                }
            }
            if (msg.serverContent.turnComplete) {
                window.isModelTurnComplete = true;
                if (document.getElementById('page-details')?.classList.contains('active')) {
                    if (!activeAudioSources || activeAudioSources.length === 0 || (playbackContext && playbackContext.currentTime >= nextPlayTime)) {
                        handleTutorTurnFinished();
                    }
                }
            }
        }
    };

    ws.onclose = (event) => {
        console.warn("WebSocket fermé:", event.code, event.reason);
        if (event.code !== 1000 && event.code !== 1005) {
            alert("Déconnexion de l'IA (Code " + event.code + "). " + (event.reason || "C'est probablement un problème de quota de clé API ou de modèle non supporté."));
        }
        disconnect();
    };
    ws.onerror = (err) => { 
        console.error("Erreur WebSocket:", err); 
        disconnect(); 
    };
}

function scheduleGracefulDisconnect() {
    if (window.isDisconnectingGracefully) return;
    window.isDisconnectingGracefully = true;
    window.liveSessionTerminating = true;

    // Laisser le temps à l'audio d'au revoir de se terminer proprement
    let delayMs = 1500;
    if (playbackContext && nextPlayTime > playbackContext.currentTime) {
        delayMs = Math.max(1200, ((nextPlayTime - playbackContext.currentTime) * 1000) + 800);
    }

    setTimeout(() => {
        if (typeof handlePresentationCompleted === 'function') {
            handlePresentationCompleted();
        }
        if (isConnected) {
            disconnect();
        }
        if (typeof setHologramState === 'function') {
            setHologramState('idle');
        }
        const speechContent = document.getElementById('holo-speech-content');
        if (speechContent) {
            speechContent.innerText = "« Formation terminée. Merci pour votre attention ! La session est déconnectée. »";
        }
        window.isDisconnectingGracefully = false;
    }, delayMs);
}

function disconnect() {
    if (ws) { 
        try { ws.close(); } catch(e){} 
        ws = null; 
    }
    if (window.advanceSlideTimeout) {
        clearTimeout(window.advanceSlideTimeout);
        window.advanceSlideTimeout = null;
    }
    stopAudioPlayback();
    stopRecording();
    isConnected = false;
    window.silenceCounter = 0;
    window.livePresentationReachedEnd = false;
    window.finalQuestionsPromptSent = false;
    window.liveSessionTerminating = false;
    window.isDisconnectingGracefully = false;
    window.isTutorPaused = false;
    window.userInterrupted = false;
    window.userAskingQuestion = false;
    window.isModelTurnComplete = false;
    resetUI();
    if (typeof setHologramState === 'function') {
        setHologramState('idle');
    }
}

function resetUI() {
    updateAssistantButtonUI();
}

async function startRecording() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000,
                channelCount: 1
            }
        });
    } catch (err) {
        console.error("Erreur micro:", err);
        disconnect();
        return;
    }

    const source = recordingContext.createMediaStreamSource(audioStream);
    processor = recordingContext.createScriptProcessor(4096, 1, 1);
    gainNode = recordingContext.createGain();
    gainNode.gain.value = 0;

    source.connect(processor);
    processor.connect(gainNode);
    gainNode.connect(recordingContext.destination);

    processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calcul du volume pour détecter la voix
        let sum = 0;
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            sum += Math.abs(inputData[i]);
            let s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        let volume = sum / inputData.length;
        
        // Coupure audio immédiate (Barge-in) : si l'utilisateur prend la parole
        const aiSpeaking = playbackContext && (playbackContext.currentTime < nextPlayTime);
        if (volume > 0.025) {
            if (aiSpeaking) {
                console.log("[Gemini Live] Prise de parole détectée au micro : interruption immédiate de la voix IA");
                stopAudioPlayback();
            }
            if (window.advanceSlideTimeout) {
                clearTimeout(window.advanceSlideTimeout);
                window.advanceSlideTimeout = null;
            }
            window.userInterrupted = true;
            window.userAskingQuestion = true;
        }

        // Animation de l'hologramme & gestion douce de la fin du cours
        if (currentCourse && document.getElementById('page-details')?.classList.contains('active')) {
            if (window.liveSessionTerminating || window.isDisconnectingGracefully) {
                return;
            }

            if (aiSpeaking || volume > 0.015) {
                window.silenceCounter = 0;
                if (!aiSpeaking && volume > 0.015) {
                    if (typeof setHologramState === 'function') setHologramState('listening');
                }
            } else {
                if (typeof setHologramState === 'function') setHologramState('idle');
                window.silenceCounter = (window.silenceCounter || 0) + (inputData.length / 16000);
                
                // Uniquement lorsque la fin de la formation a été atteinte : déconnexion en douceur après 6 secondes de silence
                if (window.livePresentationReachedEnd && window.silenceCounter >= 6.0) {
                    window.silenceCounter = 0;
                    if (ws && isConnected) {
                        if (window.finalQuestionsPromptSent) {
                            scheduleGracefulDisconnect();
                        } else {
                            window.finalQuestionsPromptSent = true;
                            ws.send(JSON.stringify({
                                clientContent: {
                                    turns: [{
                                        role: "user",
                                        parts: [{ text: "(Silence de l'apprenant. La formation est terminée et il n'a plus de questions. Conclus chaleureusement en une courte phrase d'adieu pour terminer et appelle impérativement finishTrainingSession pour clore la formation.)" }]
                                    }],
                                    turnComplete: true
                                }
                            }));
                            // Sécurité de déconnexion si l'IA tarde à appeler le tool
                            setTimeout(() => {
                                if (isConnected && window.livePresentationReachedEnd) {
                                    scheduleGracefulDisconnect();
                                }
                            }, 5000);
                        }
                    }
                }
            }
        }

        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        ws.send(JSON.stringify({
            realtimeInput: {
                audio: { mimeType: "audio/pcm;rate=16000", data: base64 }
            }
        }));
    };
}

function stopRecording() {
    stopAudioPlayback();
    if (processor) { processor.disconnect(); processor = null; }
    if (gainNode) { gainNode.disconnect(); gainNode = null; }
    if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
    if (recordingContext) { recordingContext.close(); recordingContext = null; }
    if (playbackContext) { playbackContext.close(); playbackContext = null; }
    if (typeof setHologramState === 'function') setHologramState('idle');
}

let currentLiveTutorSpeed = 1.0;
function changeLiveTutorSpeed(speed) {
    currentLiveTutorSpeed = parseFloat(speed) || 1.0;
    currentPresentationSpeed = currentLiveTutorSpeed;
    
    // Synchroniser le sélecteur du mode Présentation
    const presSelect = document.getElementById('presentation-speed-select');
    if (presSelect) {
        presSelect.value = String(currentLiveTutorSpeed);
    }
}
window.changeLiveTutorSpeed = changeLiveTutorSpeed;

// Algorithme SOLA (Synchronized Overlap-Add) : modifie la vitesse en préservant à 100% le pitch et la voix d'origine
function timeStretchPitchPreserved(samples, speed, sampleRate = 24000) {
    if (!speed || Math.abs(speed - 1.0) < 0.02 || samples.length < 480) {
        return samples;
    }
    
    const winSize = Math.floor(sampleRate * 0.02); // 20ms = 480 échantillons
    const overlap = Math.floor(winSize * 0.5);      // 10ms = 240 échantillons
    const hopOut = winSize - overlap;               // 240
    const hopIn = Math.max(1, Math.round(hopOut * speed));
    const maxSearch = Math.floor(sampleRate * 0.008); // 8ms = 192 échantillons
    
    const nIn = samples.length;
    if (nIn < winSize + maxSearch) {
        return samples;
    }
    
    const estOut = Math.floor(nIn / speed) + winSize + 256;
    const output = new Float32Array(estOut);
    
    const fadeIn = new Float32Array(overlap);
    const fadeOut = new Float32Array(overlap);
    for (let i = 0; i < overlap; i++) {
        fadeIn[i] = i / overlap;
        fadeOut[i] = 1.0 - fadeIn[i];
    }
    
    for (let i = 0; i < winSize; i++) {
        output[i] = samples[i];
    }
    
    let outPos = hopOut;
    let inPos = hopIn;
    
    while (inPos + winSize + maxSearch < nIn) {
        let bestOffset = 0;
        let bestCorr = -Infinity;
        
        const searchStart = Math.max(0, inPos - Math.floor(maxSearch / 2));
        const searchEnd = Math.min(nIn - winSize, inPos + Math.floor(maxSearch / 2));
        
        for (let s = searchStart; s <= searchEnd; s += 2) {
            let corr = 0;
            for (let j = 0; j < overlap; j += 4) {
                corr += output[outPos + j] * samples[s + j];
            }
            if (corr > bestCorr) {
                bestCorr = corr;
                bestOffset = s - inPos;
            }
        }
        
        const actualIn = inPos + bestOffset;
        for (let j = 0; j < overlap; j++) {
            output[outPos + j] = output[outPos + j] * fadeOut[j] + samples[actualIn + j] * fadeIn[j];
        }
        for (let j = overlap; j < winSize; j++) {
            output[outPos + j] = samples[actualIn + j];
        }
        
        outPos += hopOut;
        inPos += hopIn;
    }
    
    return output.subarray(0, outPos);
}

let activeAudioSources = [];

function stopAudioPlayback() {
    if (activeAudioSources && activeAudioSources.length > 0) {
        for (const src of activeAudioSources) {
            try {
                src.onended = null;
                src.stop();
                src.disconnect();
            } catch (e) {}
        }
        activeAudioSources = [];
    }
    if (playbackContext) {
        nextPlayTime = playbackContext.currentTime;
    }
    if (typeof setHologramState === 'function') {
        setHologramState('idle');
    }
}
window.stopAudioPlayback = stopAudioPlayback;

function playAudioChunk(base64Data) {
    if (!playbackContext) return;
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) { float32[i] = int16[i] / 32768.0; }
    
    const speed = currentLiveTutorSpeed || 1.0;
    
    // Modulation temporelle avec conservation intégrale du timbre et de la hauteur vocale (Pitch-Preserved)
    const processedFloat32 = (Math.abs(speed - 1.0) < 0.02)
        ? float32
        : timeStretchPitchPreserved(float32, speed, 24000);

    const buffer = playbackContext.createBuffer(1, processedFloat32.length, 24000);
    buffer.getChannelData(0).set(processedFloat32);
    
    const source = playbackContext.createBufferSource();
    source.buffer = buffer;
    
    // playbackRate reste à 1.0 afin de ne JAMAIS altérer la hauteur de la voix (pas d'effet écureuil/monstre)
    source.playbackRate.value = 1.0;

    source.connect(playbackContext.destination);
    if (nextPlayTime < playbackContext.currentTime) { nextPlayTime = playbackContext.currentTime; }
    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;

    activeAudioSources.push(source);

    source.onended = () => {
        const idx = activeAudioSources.indexOf(source);
        if (idx > -1) activeAudioSources.splice(idx, 1);
        if (document.getElementById('page-details')?.classList.contains('active')) {
            if (playbackContext && playbackContext.currentTime >= nextPlayTime) {
                if (typeof setHologramState === 'function') setHologramState('idle');
                if (window.isModelTurnComplete) {
                    handleTutorTurnFinished();
                }
            }
        }
    };

    if (document.getElementById('page-details')?.classList.contains('active')) {
        if (typeof setHologramState === 'function') setHologramState('speaking');
    }
}

function handleTutorTurnFinished() {
    if (!currentCourse || !isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
    const isDetails = document.getElementById('page-details')?.classList.contains('active');
    if (!isDetails) return;
    if (window.liveSessionTerminating || window.isDisconnectingGracefully) return;
    if (window.isTutorPaused) return;

    if (window.advanceSlideTimeout) {
        clearTimeout(window.advanceSlideTimeout);
        window.advanceSlideTimeout = null;
    }

    // 1. SI L'APPRENANT AVAIT POSÉ UNE QUESTION OU INTERROMPU :
    if (window.userAskingQuestion || window.userInterrupted) {
        // Le formateur a terminé sa réponse à la question.
        // On laisse une pause de 4.5 secondes à l'apprenant pour lui permettre de réagir ou poser une autre question.
        window.advanceSlideTimeout = setTimeout(() => {
            if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
            if (window.isTutorPaused || window.liveSessionTerminating) return;
            
            const aiSpeaking = playbackContext && (playbackContext.currentTime < nextPlayTime);
            if (aiSpeaking) return;

            window.userAskingQuestion = false;
            window.userInterrupted = false;

            // Reprendre naturellement le cours à l'étape actuelle si la formation n'est pas achevée
            if (!window.livePresentationReachedEnd) {
                const curSlide = window.currentLiveSlide || 1;
                const p = getSlideTeachingPayload(curSlide);
                window.isModelTurnComplete = false;
                ws.send(JSON.stringify({
                    clientContent: {
                        turns: [{
                            role: "user",
                            parts: [{
                                text: `(L'apprenant n'a pas d'autre question. Poursuis naturellement la formation là où elle s'était arrêtée, à l'étape en cours (${curSlide} sur ${window.liveTotalSlides} : "${p.title}"). Assure une transition chaleureuse et fluide, termine d'expliquer les concepts clés et prépare la suite, sans jamais prononcer le mot diapositive.)`
                            }]
                        }],
                        turnComplete: true
                    }
                }));
            }
        }, 4500);
        return;
    }

    // 2. SI TOUTES LES ÉTAPES DU COURS ONT DÉJÀ ÉTÉ COUVERTES :
    if (window.livePresentationReachedEnd) return;

    // 3. ENCHAÎNEMENT NATUREL ET CONTINU DU COURS ÉTAPE PAR ÉTAPE :
    // Respiration humaine naturelle de 2.2 secondes entre les étapes
    window.advanceSlideTimeout = setTimeout(() => {
        if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
        if (window.isTutorPaused || window.liveSessionTerminating) return;
        if (window.userAskingQuestion || window.userInterrupted) return;
        
        const aiSpeaking = playbackContext && (playbackContext.currentTime < nextPlayTime);
        if (aiSpeaking) return;

        const nextSlide = (window.currentLiveSlide || 1) + 1;
        if (nextSlide <= (window.liveTotalSlides || 1)) {
            window.currentLiveSlide = nextSlide;
            pageNum = nextSlide;
            renderPage(nextSlide);
            
            const p = getSlideTeachingPayload(nextSlide);
            const isLast = (nextSlide === window.liveTotalSlides);
            window.isModelTurnComplete = false;
            
            ws.send(JSON.stringify({
                clientContent: {
                    turns: [{
                        role: "user",
                        parts: [{
                            text: `(Passe maintenant à l'étape suivante du cours : étape ${nextSlide} sur ${window.liveTotalSlides}. Appelle discrètement changeSlide(${nextSlide}${isLast ? ', true' : ''}). Explique chaleureusement et de manière vivante son contenu en faisant le matching parfait entre le support et le script préparé.
Thème : "${p.title}"
Notions clés du support : "${p.bullets}"
Trame narrative préparée : "${p.narration}"
Reste 100% naturel, ne prononce aucun terme comme diapositive ou slide, parle comme un vrai formateur d'entreprise SGCI.)`
                        }]
                    }],
                    turnComplete: true
                }
            }));
        } else {
            // Fin de toutes les étapes du cours atteinte
            window.livePresentationReachedEnd = true;
            window.isModelTurnComplete = false;
            ws.send(JSON.stringify({
                clientContent: {
                    turns: [{
                        role: "user",
                        parts: [{
                            text: `(Toutes les étapes du cours ont été présentées. Fais une courte synthèse chaleureuse de l'essentiel à retenir pour l'apprenant. Demande-lui s'il a des questions sur l'ensemble de la formation avant de conclure.)`
                        }]
                    }],
                    turnComplete: true
                }
            }));
        }
    }, 2200);
}

