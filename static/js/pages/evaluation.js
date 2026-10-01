// =========================================================================
// PAGE EVALUATION / MODE 3 : QUIZ DE CONNAISSANCES & DIAGNOSTIC PEDAGOGIQUE
// =========================================================================

// ==========================================================================
// MODULE : ÉVALUATION INTERACTIVE & DIAGNOSTIC PÉDAGOGIQUE IA
// ==========================================================================
let currentEvalQuiz = null;
let currentEvalIndex = 0;
let currentEvalAnswers = {}; // { questionId: selectedOptionIndex }
let lastEvalDiagnostic = null;
let currentEvalLatestResult = null;

window.startCurrentCourseEvaluation = function() {
    const course = (currentCourse && currentCourse.id) ? currentCourse : (typeof selectedCourseForModal !== 'undefined' && selectedCourseForModal && selectedCourseForModal.id ? selectedCourseForModal : null);
    if (!course) {
        alert("Veuillez d'abord sélectionner une formation.");
        return;
    }
    const hasFollowed = Boolean(course.has_completed_training || course.user_evaluation);
    if (!hasFollowed) {
        alert("Vous devez d'abord suivre la formation jusqu'au bout pour débloquer l'évaluation.");
        return;
    }
    startEvaluationMode(course.id);
};

window.startEvaluationMode = async function(courseId) {
    const course = courses.find(c => c.id == courseId);
    if (!course) {
        alert("Formation introuvable");
        return;
    }
    const hasFollowed = Boolean(course.has_completed_training || course.user_evaluation);
    if (!hasFollowed) {
        alert("Vous devez d'abord suivre la formation jusqu'au bout pour débloquer l'évaluation.");
        return;
    }
    currentCourse = course;
    try {
        sessionStorage.setItem('ia_formation_course_id', courseId);
        sessionStorage.setItem('ia_formation_course_mode', 'evaluation');
        sessionStorage.setItem('ia_formation_current_page', 'evaluation');
        localStorage.setItem('ia_formation_course_id', courseId);
        localStorage.setItem('ia_formation_course_mode', 'evaluation');
        localStorage.setItem('ia_formation_current_page', 'evaluation');
    } catch (e) {}
    
    // Mettre en pause tout audio en cours
    if (typeof presentationAudio !== 'undefined' && presentationAudio) {
        try { presentationAudio.pause(); } catch (e) {}
    }
    if (typeof audioPlayer !== 'undefined' && audioPlayer) {
        try { audioPlayer.pause(); } catch (e) {}
    }

    // Si on n'est pas sur la page dédiée /evaluation, rediriger immédiatement
    const evalPage = document.getElementById('page-evaluation');
    if (!evalPage) {
        window.location.href = '/evaluation?course_id=' + courseId;
        return;
    }

    // Basculer vers la page d'évaluation
    window.navigateTo('evaluation');

    // Réinitialiser les états
    currentEvalQuiz = null;
    currentEvalIndex = 0;
    currentEvalAnswers = {};
    lastEvalDiagnostic = null;
    currentEvalLatestResult = null;

    // Titres et métadonnées
    const titleEl = document.getElementById('eval-course-title');
    if (titleEl) titleEl.innerText = course.title;
    const domainEl = document.getElementById('eval-course-domain');
    if (domainEl) domainEl.innerText = course.domain || 'Formation continue SGCI';
    
    // Afficher écran intro et masquer les autres
    const screenIntro = document.getElementById('eval-screen-intro');
    const screenQuestions = document.getElementById('eval-screen-questions');
    const screenLoading = document.getElementById('eval-screen-loading');
    const screenResults = document.getElementById('eval-screen-results');
    if (screenIntro) screenIntro.style.display = 'block';
    if (screenQuestions) screenQuestions.style.display = 'none';
    if (screenLoading) screenLoading.style.display = 'none';
    if (screenResults) screenResults.style.display = 'none';

    // Charger les questions et l'éventuelle évaluation passée depuis l'API
    const userId = currentUser ? currentUser.id : '';
    try {
        const res = await fetch(`/api/courses/${courseId}/quiz?user_id=${userId}`);
        const data = await res.json();
        if (data.success && data.questions && data.questions.length > 0) {
            currentEvalQuiz = data;
            const qCountEl = document.getElementById('eval-intro-qcount');
            if (qCountEl) qCountEl.innerText = data.questions.length;

            currentEvalLatestResult = data.latest_evaluation || null;
            const pastResultEl = document.getElementById('eval-intro-past-result');
            const startBtnText = document.getElementById('eval-intro-start-text');

            if (currentEvalLatestResult) {
                if (pastResultEl) pastResultEl.style.display = 'block';
                const scoreEl = document.getElementById('eval-intro-past-score');
                if (scoreEl) scoreEl.innerText = `${Math.round(currentEvalLatestResult.score)}%`;
                
                const badgeEl = document.getElementById('eval-intro-past-badge');
                if (badgeEl) {
                    const isPassed = currentEvalLatestResult.passed;
                    badgeEl.innerText = isPassed ? 'Validé' : 'À consolider';
                    badgeEl.style.background = isPassed ? '#f1f5f9' : '#fee2e2';
                    badgeEl.style.color = isPassed ? '#000000' : '#b91c1c';
                }

                const dateEl = document.getElementById('eval-intro-past-date');
                if (dateEl && currentEvalLatestResult.completed_at) {
                    try {
                        const d = new Date(currentEvalLatestResult.completed_at);
                        dateEl.innerText = `Effectué le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                    } catch (e) {
                        dateEl.innerText = currentEvalLatestResult.completed_at;
                    }
                }

                if (startBtnText) startBtnText.innerText = 'Repasser une nouvelle évaluation';
            } else {
                if (pastResultEl) pastResultEl.style.display = 'none';
                if (startBtnText) startBtnText.innerText = 'Commencer le test maintenant';
            }
        } else {
            alert(data.error || "Impossible de charger le questionnaire d'évaluation pour ce cours.");
            window.navigateTo('presentation');
        }
    } catch (err) {
        console.error("Erreur chargement quiz:", err);
        alert("Erreur lors de la récupération du questionnaire d'évaluation.");
    }
};

window.viewPastEvaluationDiagnostic = function() {
    if (!currentEvalLatestResult || !currentEvalLatestResult.diagnostic) {
        alert("Aucun diagnostic enregistré pour cette évaluation.");
        return;
    }
    lastEvalDiagnostic = currentEvalLatestResult.diagnostic;
    document.getElementById('eval-screen-intro').style.display = 'none';
    document.getElementById('eval-screen-questions').style.display = 'none';
    document.getElementById('eval-screen-loading').style.display = 'none';
    document.getElementById('eval-screen-results').style.display = 'block';
    renderEvaluationResults(currentEvalLatestResult.diagnostic);
};

window.exitEvaluation = function() {
    let mode = null;
    try {
        mode = sessionStorage.getItem('ia_formation_course_mode') || localStorage.getItem('ia_formation_course_mode');
    } catch(e) {}

    if (currentCourse) {
        if (mode === 'live') {
            startLiveTutorMode(currentCourse.id);
        } else {
            startPresentationMode(currentCourse.id);
        }
    } else {
        window.navigateTo('consultation');
    }
};

window.startQuizQuestions = function() {
    if (!currentEvalQuiz || !currentEvalQuiz.questions || currentEvalQuiz.questions.length === 0) {
        alert("Aucune question disponible pour ce test.");
        return;
    }
    currentEvalIndex = 0;
    currentEvalAnswers = {};

    document.getElementById('eval-screen-intro').style.display = 'none';
    document.getElementById('eval-screen-questions').style.display = 'block';
    document.getElementById('eval-screen-results').style.display = 'none';
    document.getElementById('eval-screen-loading').style.display = 'none';

    renderCurrentQuizQuestion();
};

function renderCurrentQuizQuestion() {
    if (!currentEvalQuiz) return;
    const questions = currentEvalQuiz.questions;
    const total = questions.length;
    const q = questions[currentEvalIndex];
    if (!q) return;

    // Progression
    const progText = document.getElementById('eval-progress-text');
    if (progText) progText.innerText = `Question ${currentEvalIndex + 1} sur ${total}`;
    
    const percent = Math.round(((currentEvalIndex + 1) / total) * 100);
    const fillEl = document.getElementById('eval-progress-bar-fill');
    if (fillEl) fillEl.style.width = `${percent}%`;

    const badgeEl = document.getElementById('eval-current-concept-badge');
    if (badgeEl) badgeEl.innerText = q.concept ? `Notion : ${q.concept}` : 'Notion clé';

    // Question
    const qTextEl = document.getElementById('eval-question-text');
    if (qTextEl) qTextEl.innerText = `${currentEvalIndex + 1}. ${q.question}`;

    // Options
    const container = document.getElementById('eval-options-container');
    if (!container) return;
    container.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D', 'E'];
    const currentSelected = currentEvalAnswers[q.id !== undefined ? q.id : currentEvalIndex];

    (q.options || []).forEach((opt, optIdx) => {
        const isSelected = currentSelected === optIdx;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `eval-option-btn ${isSelected ? 'selected' : ''}`;
        btn.onclick = () => selectQuizOption(q.id !== undefined ? q.id : currentEvalIndex, optIdx);

        btn.innerHTML = `
            <div class="eval-option-radio"></div>
            <div style="display: flex; gap: 8px; align-items: baseline; flex: 1;">
                <strong style="color: ${isSelected ? '#e9041e' : '#475569'}; min-width: 22px;">${letters[optIdx] || optIdx + 1}.</strong>
                <span style="line-height: 1.45;">${opt}</span>
            </div>
        `;
        container.appendChild(btn);
    });

    // Boutons de navigation
    const prevBtn = document.getElementById('eval-btn-prev');
    const nextBtn = document.getElementById('eval-btn-next');
    const submitBtn = document.getElementById('eval-btn-submit');

    if (prevBtn) prevBtn.style.visibility = (currentEvalIndex > 0) ? 'visible' : 'hidden';

    if (currentEvalIndex === total - 1) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-flex';
    } else {
        if (nextBtn) nextBtn.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
    }
}

window.selectQuizOption = function(qId, optIdx) {
    currentEvalAnswers[qId] = optIdx;
    renderCurrentQuizQuestion();
};

window.prevQuizQuestion = function() {
    if (currentEvalIndex > 0) {
        currentEvalIndex--;
        renderCurrentQuizQuestion();
    }
};

window.nextQuizQuestion = function() {
    if (currentEvalQuiz && currentEvalIndex < currentEvalQuiz.questions.length - 1) {
        currentEvalIndex++;
        renderCurrentQuizQuestion();
    }
};

let oralMediaRecorder = null;
let oralAudioChunks = [];
let oralRecordedBlob = null;

window.submitEvaluation = async function() {
    if (!currentEvalQuiz || !currentCourse) return;
    const questions = currentEvalQuiz.questions;
    const total = questions.length;

    // Vérifier si toutes les questions sont répondues
    const answeredCount = Object.keys(currentEvalAnswers).length;
    if (answeredCount < total) {
        const confirmSubmit = confirm(`Vous avez répondu à ${answeredCount} question(s) sur ${total}. Voulez-vous tout de même soumettre vos réponses écrites ?`);
        if (!confirmSubmit) return;
    }

    // Afficher écran de chargement IA
    document.getElementById('eval-screen-questions').style.display = 'none';
    document.getElementById('eval-screen-loading').style.display = 'block';

    try {
        const payload = {
            user_id: currentUser ? currentUser.id : null,
            answers: currentEvalAnswers
        };

        const res = await fetch(`/api/courses/${currentCourse.id}/quiz/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success && data.evaluation) {
            lastEvalDiagnostic = data.evaluation;
            
            // Vérifier si la formation est assignée : si oui, épreuve orale obligatoire (Section 26 & 27)
            const isAssigned = Boolean(currentCourse.is_assigned);
            if (isAssigned) {
                document.getElementById('eval-screen-loading').style.display = 'none';
                document.getElementById('eval-screen-oral').style.display = 'block';
                
                // Charger la question orale depuis l'API
                try {
                    const oRes = await fetch(`/api/courses/${currentCourse.id}/oral_questions?user_id=${currentUser ? currentUser.id : ''}`);
                    const oData = await oRes.json();
                    if (oData.success && oData.oral_questions && oData.oral_questions.length > 0) {
                        const q1 = oData.oral_questions[0];
                        const qEl = document.getElementById('eval-oral-question-text');
                        if (qEl) qEl.innerText = q1.question;
                    }
                } catch (eOral) {
                    console.warn("Erreur chargement consigne orale:", eOral);
                }
                return;
            }

            // Formation publique : validation par QCM direct (100% QCM, seuil 70%)
            renderEvaluationResults(data.evaluation);
            if (currentUser && typeof loadCourses === 'function') {
                loadCourses();
            }
        } else {
            alert(data.error || "Une erreur est survenue lors de l'évaluation de vos réponses.");
            document.getElementById('eval-screen-loading').style.display = 'none';
            document.getElementById('eval-screen-questions').style.display = 'block';
        }
    } catch (err) {
        console.error("Erreur submitEvaluation:", err);
        alert("Erreur de connexion au serveur pour l'évaluation.");
        document.getElementById('eval-screen-loading').style.display = 'none';
        document.getElementById('eval-screen-questions').style.display = 'block';
    }
};

window.startOralRecording = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        oralAudioChunks = [];
        oralMediaRecorder = new MediaRecorder(stream);
        oralMediaRecorder.ondataavailable = e => { if (e.data.size > 0) oralAudioChunks.push(e.data); };
        oralMediaRecorder.onstop = () => {
            oralRecordedBlob = new Blob(oralAudioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(oralRecordedBlob);
            const player = document.getElementById('eval-oral-audio-playback');
            if (player) {
                player.src = audioUrl;
                document.getElementById('oral-audio-player-box').style.display = 'block';
            }
            stream.getTracks().forEach(t => t.stop());
        };
        oralMediaRecorder.start();
        document.getElementById('btn-start-record-oral').style.display = 'none';
        document.getElementById('btn-stop-record-oral').style.display = 'inline-flex';
        const st = document.getElementById('oral-recording-status');
        if (st) {
            st.innerText = "🔴 Enregistrement vocal en cours... Parlez clairement.";
            st.style.color = "#dc2626";
        }
    } catch (e) {
        console.warn("Microphone access error:", e);
        alert("Impossible d'accéder au micro. Vous pouvez rédiger directement votre argumentation dans la zone de texte prévue ci-dessous.");
    }
};

window.stopOralRecording = function() {
    if (oralMediaRecorder && oralMediaRecorder.state === 'recording') {
        oralMediaRecorder.stop();
    }
    document.getElementById('btn-start-record-oral').style.display = 'inline-flex';
    document.getElementById('btn-stop-record-oral').style.display = 'none';
    const st = document.getElementById('oral-recording-status');
    if (st) {
        st.innerText = "✅ Enregistrement terminé. Vous pouvez réécouter votre enregistrement ci-dessous.";
        st.style.color = "#000000";
    }
};

window.backToQcmFromOral = function() {
    document.getElementById('eval-screen-oral').style.display = 'none';
    document.getElementById('eval-screen-questions').style.display = 'block';
};

window.submitOralAndFinish = async function() {
    if (!currentCourse) return;
    const writtenText = (document.getElementById('eval-oral-text-response')?.value || '').trim();
    if (!oralRecordedBlob && !writtenText) {
        alert("Veuillez enregistrer votre réponse orale ou saisir votre argumentation par écrit.");
        return;
    }

    document.getElementById('eval-screen-oral').style.display = 'none';
    document.getElementById('eval-screen-loading').style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('user_id', currentUser ? currentUser.id : 1);
        formData.append('response_text', writtenText);
        if (oralRecordedBlob) {
            formData.append('audio', oralRecordedBlob, 'oral_response.webm');
        }

        const res = await fetch(`/api/courses/${currentCourse.id}/oral_evaluation`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            renderOralEvaluationResults(data);
        } else {
            alert(data.error || "Erreur lors de la notation de l'épreuve orale.");
            document.getElementById('eval-screen-loading').style.display = 'none';
            document.getElementById('eval-screen-oral').style.display = 'block';
        }
    } catch (e) {
        console.error("submitOralAndFinish error:", e);
        alert("Erreur de connexion au serveur.");
        document.getElementById('eval-screen-loading').style.display = 'none';
        document.getElementById('eval-screen-oral').style.display = 'block';
    }
};

function renderOralEvaluationResults(oralData) {
    document.getElementById('eval-screen-loading').style.display = 'none';
    document.getElementById('eval-screen-results').style.display = 'block';

    const isPassed = oralData.passed;
    const finalScore = Math.round(oralData.final_score || oralData.score_oral || 0);
    const qcmScore = Math.round(oralData.qcm_score || 0);
    const oralScore = Math.round(oralData.score_oral || 0);

    const circleEl = document.getElementById('eval-result-circle');
    if (circleEl) circleEl.className = isPassed ? 'score-circle-passed' : 'score-circle-failed';

    const percentEl = document.getElementById('eval-result-score-percent');
    if (percentEl) percentEl.innerText = `${finalScore}%`;

    const fracEl = document.getElementById('eval-result-score-fraction');
    if (fracEl) fracEl.innerText = `${finalScore}/100`;

    const badgeEl = document.getElementById('eval-result-badge');
    if (badgeEl) {
        badgeEl.innerText = isPassed ? 'Certifié SGCI / Validé' : 'Non validé (Seuil 70%)';
        badgeEl.style.background = isPassed ? '#f1f5f9' : '#fee2e2';
        badgeEl.style.color = isPassed ? '#000000' : '#b91c1c';
    }

    const headingEl = document.getElementById('eval-result-heading');
    if (headingEl) {
        headingEl.innerText = isPassed ? 'Félicitations ! Formation certifiée SGCI' : 'Objectif non atteint (Seuil de validation: 70%)';
    }

    const subtextEl = document.getElementById('eval-result-subtext');
    if (subtextEl) {
        subtextEl.innerText = isPassed
            ? 'Vous avez validé avec succès les composantes écrite et orale de ce parcours bancaire.'
            : 'Votre note combinée est inférieure au seuil de 70%. Révisez vos acquis avant de repasser l\'épreuve.';
    }

    // Afficher la pondération 70% Écrit / 30% Oral
    const weightsBox = document.getElementById('eval-result-weights-breakdown');
    if (weightsBox) {
        weightsBox.style.display = 'block';
        const wQ = document.getElementById('eval-weight-qcm');
        if (wQ) wQ.innerText = `${qcmScore}%`;
        const wO = document.getElementById('eval-weight-oral');
        if (wO) wO.innerText = `${oralScore}%`;
    }

    const bilanEl = document.getElementById('eval-diagnostic-bilan');
    if (bilanEl) {
        bilanEl.innerText = oralData.feedback || "Synthèse de l'épreuve orale et écrite établie par T-chIA.";
    }

    if (currentUser && typeof loadCourses === 'function') {
        loadCourses();
    }
}

function renderEvaluationResults(evalData) {
    document.getElementById('eval-screen-loading').style.display = 'none';
    document.getElementById('eval-screen-results').style.display = 'block';

    const isPassed = evalData.passed;
    const score = evalData.score || 0;
    const total = evalData.total || 0;
    const correctCount = evalData.correct_count || 0;

    // 1. Cercle & Score
    const circleEl = document.getElementById('eval-result-circle');
    if (circleEl) circleEl.className = isPassed ? 'score-circle-passed' : 'score-circle-failed';
    
    const percentEl = document.getElementById('eval-result-score-percent');
    if (percentEl) percentEl.innerText = `${Math.round(score)}%`;
    
    const fracEl = document.getElementById('eval-result-score-fraction');
    if (fracEl) fracEl.innerText = `${correctCount}/${total}`;

    const badgeEl = document.getElementById('eval-result-badge');
    if (badgeEl) {
        badgeEl.innerText = isPassed ? 'Validé avec succès' : 'Non validé';
        badgeEl.style.background = isPassed ? '#f1f5f9' : '#fee2e2';
        badgeEl.style.color = isPassed ? '#000000' : '#b91c1c';
    }

    const headingEl = document.getElementById('eval-result-heading');
    if (headingEl) {
        headingEl.innerText = isPassed ? 'Félicitations ! Module validé' : 'Objectif non atteint (Score requis: 70%)';
    }

    const subtextEl = document.getElementById('eval-result-subtext');
    if (subtextEl) {
        subtextEl.innerText = isPassed 
            ? 'Vos acquis sont solides. Vous avez démontré une assimilation complète des notions clés.'
            : 'Ne vous découragez pas ! Consultez le diagnostic ci-dessous pour cibler vos points à consolider.';
    }

    // 2. Bilan Pédagogique IA
    const bilanEl = document.getElementById('eval-diagnostic-bilan');
    if (bilanEl) {
        bilanEl.innerText = evalData.bilan_pedagogique || "Bilan de l'évaluation établi par le Tuteur IA.";
    }

    // 3. Notions Acquises
    const acquisesContainer = document.getElementById('eval-notions-acquises-list');
    if (acquisesContainer) {
        acquisesContainer.innerHTML = '';
        const acquises = evalData.notions_acquises || [];
        if (acquises.length > 0) {
            acquises.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13.5px;';
                row.innerHTML = `
                    <span style="font-weight: 700; color: #000000;">${item.concept}</span>
                    <span class="eval-concept-pill concept-acquired">Maîtrisé</span>
                `;
                acquisesContainer.appendChild(row);
            });
        } else {
            acquisesContainer.innerHTML = `<p style="color: #64748b; font-size: 13px; font-style: italic; margin: 0;">Aucune notion entièrement validée lors de cette tentative.</p>`;
        }
    }

    // 4. Notions à Renforcer
    const renforcerContainer = document.getElementById('eval-notions-renforcer-list');
    if (renforcerContainer) {
        renforcerContainer.innerHTML = '';
        const aRenforcer = evalData.notions_a_renforcer || [];
        if (aRenforcer.length > 0) {
            aRenforcer.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 10px 14px; background: #fff5f5; border-radius: 8px; border: 1px solid #fca5a5; font-size: 13px;';
                row.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <strong style="color: #e9041e;">${item.concept}</strong>
                        <span class="eval-concept-pill concept-review">À consolider</span>
                    </div>
                    <span style="color: #78350f; font-size: 12px; margin-top: 2px;">${item.conseil || 'Concept à approfondir'}</span>
                `;
                renforcerContainer.appendChild(row);
            });
        } else {
            renforcerContainer.innerHTML = `<p style="color: #000000; font-size: 13px; font-weight: 700; margin: 0;">Parfait ! Aucune notion fragile détectée sur cette évaluation.</p>`;
        }
    }

    // 5. Corrigé Pédagogique Détaillé
    const reviewList = document.getElementById('eval-questions-review-list');
    if (reviewList) {
        reviewList.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D', 'E'];

        (evalData.results_by_question || []).forEach((res, i) => {
            const itemCard = document.createElement('div');
            itemCard.className = `eval-review-item ${res.is_correct ? 'correct' : 'incorrect'}`;

            const userAnsText = (res.user_answer !== null && res.options && res.options[res.user_answer] !== undefined)
                ? `${letters[res.user_answer] || ''}. ${res.options[res.user_answer]}`
                : 'Aucune réponse fournie';

            const correctAnsText = (res.options && res.options[res.correct_index] !== undefined)
                ? `${letters[res.correct_index] || ''}. ${res.options[res.correct_index]}`
                : 'Réponse exacte';

            itemCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 800; font-size: 14px; color: #0f172a;">Question ${i + 1}</span>
                    <span style="font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 12px; background: ${res.is_correct ? '#f1f5f9' : '#fee2e2'}; color: ${res.is_correct ? '#000000' : '#b91c1c'}; border: 1px solid ${res.is_correct ? '#cbd5e1' : '#fca5a5'};">
                        ${res.is_correct ? 'Correct (+1 pt)' : 'Incorrect (0 pt)'}
                    </span>
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">
                    ${res.question}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; font-size: 13px;">
                    <div style="padding: 8px 12px; background: ${res.is_correct ? '#f8fafc' : '#fee2e2'}; border-radius: 6px; border: 1px solid ${res.is_correct ? '#cbd5e1' : '#fecaca'};">
                        <strong style="color: ${res.is_correct ? '#000000' : '#b91c1c'};">Votre réponse :</strong><br>
                        <span style="color: #334155;">${userAnsText}</span>
                    </div>
                    <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #cbd5e1;">
                        <strong style="color: #000000;">Bonne réponse :</strong><br>
                        <span style="color: #334155;">${correctAnsText}</span>
                    </div>
                </div>
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #475569; line-height: 1.5;">
                    <strong style="color: #e9041e;">Explication pédagogique de l'IA :</strong> ${res.explication || 'Non fournie'}
                </div>
            `;
            reviewList.appendChild(itemCard);
        });
    }

    // 6. Section Renforcement
    const reinfSection = document.getElementById('eval-reinforcement-section');
    const reinfSummary = document.getElementById('eval-reinforcement-summary');
    const aRenforcer = evalData.notions_a_renforcer || [];
    if (reinfSection && reinfSummary) {
        if (aRenforcer.length > 0 && evalData.synthese_renforcement) {
            reinfSection.style.display = 'block';
            reinfSummary.innerText = evalData.synthese_renforcement;
        } else if (isPassed) {
            reinfSection.style.display = 'none';
        } else {
            reinfSection.style.display = 'block';
            reinfSummary.innerText = "Revoir l'ensemble des diapositives du cours et interroger le Tuteur IA pour dissiper vos doutes.";
        }
    }
}

window.retakeCurrentEvaluation = function() {
    if (!currentEvalQuiz) return;
    startQuizQuestions();
};

window.launchReinforcementWithAiTutor = function() {
    if (!currentCourse) return;
    const weakConcepts = (lastEvalDiagnostic && lastEvalDiagnostic.notions_a_renforcer) 
        ? lastEvalDiagnostic.notions_a_renforcer.map(n => n.concept).join(', ') 
        : '';

    // Basculer sur le mode présentation
    startPresentationMode(currentCourse.id);

    // Ouvrir le volet de questions/chat RAG
    const chatDrawer = document.getElementById('presentation-chat-drawer');
    if (chatDrawer && chatDrawer.classList.contains('chat-hidden')) {
        togglePresentationChat(true);
    }

    // Pré-remplir la question et l'envoyer au Tuteur IA
    const chatInput = document.getElementById('rag-chat-input');
    if (chatInput) {
        const questionPrompt = weakConcepts 
            ? `Bonjour Tuteur, suite à mon évaluation sur "${currentCourse.title}", je souhaite consolider les notions suivantes : ${weakConcepts}. Peux-tu m'expliquer clairement ces notions avec des exemples concrets ?`
            : `Bonjour Tuteur, peux-tu me faire un récapitulatif pédagogique des points essentiels de la formation "${currentCourse.title}" ?`;
        
        chatInput.value = questionPrompt;
        setTimeout(() => {
            if (typeof sendRagQuestion === 'function') {
                sendRagQuestion();
            }
        }, 600);
    }
};


// --- UTILITAIRES D'AFFICHAGE DES EVALUATIONS ---
// --- HISTORIQUE DES ÉVALUATIONS & CERTIFICATIONS ---
function formatEvaluationDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
        return dateStr;
    }
}

function createEvaluationHistoryCard(ev) {
    const card = document.createElement('div');
    card.style.cssText = 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);';

    const isPassed = ev.passed;
    const scoreVal = Math.round(ev.score);
    const dateFormatted = formatEvaluationDate(ev.completed_at);

    card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px; min-width: 240px; flex: 1;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: ${isPassed ? '#f1f5f9' : '#fee2e2'}; color: ${isPassed ? '#000000' : '#b91c1c'}; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid ${isPassed ? '#000000' : '#fecaca'};">
                ${scoreVal}%
            </div>
            <div>
                <h4 style="margin: 0 0 3px 0; font-size: 14.5px; color: #0f172a; font-weight: 800;">${ev.course_title || 'Formation'}</h4>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 11.5px; color: #000000; font-weight: 600;">${ev.course_domain || 'SGCI'}</span>
                    <span style="font-size: 11.5px; color: #94a3b8;">•</span>
                    <span style="font-size: 11.5px; color: #64748b;">${dateFormatted}</span>
                    <span style="font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 10px; background: ${isPassed ? '#f1f5f9' : '#fee2e2'}; color: ${isPassed ? '#000000' : '#b91c1c'};">
                        ${isPassed ? 'Validé' : 'À consolider'}
                    </span>
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <button type="button" onclick="viewHistoricalEvaluation(${ev.course_id}, ${ev.id})" class="action-btn-sm" style="background: #000000; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                Voir le bilan IA
            </button>
        </div>
    `;
    return card;
}

