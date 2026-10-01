// =========================================================================
// PAGE PRESENTATION / MODE 1 : PRESENTATION SYNCHRONISEE PDF & AUDIO
// =========================================================================

// =========================================================================
// MODE 1 : MODE PRÉSENTATION & AUDIO SYNCHRONISÉ AVEC DÉFILEMENT AUTO & RAG
// =========================================================================
let presentationPdfDoc = null;
let presentationPageNum = 1;
let presentationTotalPages = 1;
let presentationTimestamps = [];
let presentationMediaRecorder = null;
let presentationAudioChunks = [];
let isRagRecording = false;
let wasPresPausedForQuestion = false;

function pausePresentationForQuestion() {
    const presAudio = document.getElementById('presentation-audio');
    if (presAudio && !presAudio.paused) {
        presAudio.pause();
        wasPresPausedForQuestion = true;
        const btnResume = document.getElementById('presentation-resume-btn');
        if (btnResume) btnResume.style.display = 'inline-flex';
    }
    const ragAudio = document.getElementById('rag-audio-player');
    if (ragAudio && !ragAudio.paused) {
        ragAudio.pause();
    }
}

window.resumePresentationAudio = function() {
    const presAudio = document.getElementById('presentation-audio');
    if (presAudio) {
        const ragAudio = document.getElementById('rag-audio-player');
        if (ragAudio && !ragAudio.paused) {
            ragAudio.pause();
        }
        presAudio.play().then(() => {
            const btnResume = document.getElementById('presentation-resume-btn');
            if (btnResume) btnResume.style.display = 'none';
            wasPresPausedForQuestion = false;
        }).catch(err => {
            console.warn("Erreur reprise audio:", err);
        });
    }
};

let currentPresentationSpeed = 1.0;
function changePresentationSpeed(speed) {
    currentPresentationSpeed = parseFloat(speed) || 1.0;
    currentLiveTutorSpeed = currentPresentationSpeed;
    
    // Synchroniser le sélecteur du mode Live
    const liveSelect = document.getElementById('live-speed-select');
    if (liveSelect) {
        liveSelect.value = String(currentPresentationSpeed);
    }
    
    // Appliquer au lecteur de présentation avec préservation absolue de la voix (hauteur / timbre)
    const presAudio = document.getElementById('presentation-audio');
    if (presAudio) {
        presAudio.preservesPitch = true;
        presAudio.mozPreservesPitch = true;
        presAudio.webkitPreservesPitch = true;
        presAudio.playbackRate = currentPresentationSpeed;
    }
    
    // Appliquer au lecteur de questions RAG
    const ragAudio = document.getElementById('rag-audio-player');
    if (ragAudio) {
        ragAudio.preservesPitch = true;
        ragAudio.mozPreservesPitch = true;
        ragAudio.webkitPreservesPitch = true;
        ragAudio.playbackRate = currentPresentationSpeed;
    }
}
window.changePresentationSpeed = changePresentationSpeed;

let progressSaveTimeout = null;
function saveCurrentCourseProgress(courseId, slideNum, totalSlides, mode = 'presentation', completed = false) {
    if (mode === 'live') return; // Aucun suivi de progression par slide pour Gemini Live
    if (!currentUser || !currentUser.id || !courseId) return;
    const isAdminOrSuper = currentUser.role === 'admin' || currentUser.role === 'superadmin';
    if (isAdminOrSuper) return; // Ne pas enregistrer de progression pour les administrateurs
    
    // Mettre à jour l'objet en mémoire pour synchronisation immédiate
    const course = courses.find(c => c.id == courseId);
    if (course) {
        if (!course.user_progress) {
            course.user_progress = {};
        }
        course.user_progress.current_slide = slideNum;
        course.user_progress.total_slides = totalSlides;
        course.user_progress.progress_percent = Math.min(100, Math.round((slideNum / totalSlides) * 100));
        course.user_progress.last_mode = mode;
        if (completed || slideNum >= totalSlides) {
            course.user_progress.completed = true;
            course.has_completed_training = true;
        }
    }

    if (progressSaveTimeout) clearTimeout(progressSaveTimeout);
    progressSaveTimeout = setTimeout(() => {
        fetch(`/api/courses/${courseId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                current_slide: slideNum,
                total_slides: totalSlides,
                mode: mode,
                completed: completed
            })
        }).catch(err => console.warn("Erreur sauvegarde progression:", err));
    }, 300);
}
window.saveCurrentCourseProgress = saveCurrentCourseProgress;

function startPresentationMode(id, startFromSlide = 1) {
    const course = courses.find(c => c.id == id);
    if (!course) return;
    
    startFromSlide = Math.max(1, parseInt(startFromSlide) || 1);

    try {
        sessionStorage.setItem('ia_formation_course_id', id);
        sessionStorage.setItem('ia_formation_course_mode', 'presentation');
        sessionStorage.setItem('ia_formation_presentation_slide', startFromSlide);
        sessionStorage.setItem('ia_formation_current_page', 'presentation');
        localStorage.setItem('ia_formation_course_id', id);
        localStorage.setItem('ia_formation_course_mode', 'presentation');
        localStorage.setItem('ia_formation_presentation_slide', startFromSlide);
        localStorage.setItem('ia_formation_current_page', 'presentation');
    } catch(e) {}

    // Si on n'est pas sur la page dédiée /presentation, rediriger immédiatement
    const presPage = document.getElementById('page-presentation');
    if (!presPage) {
        window.location.href = '/presentation?course_id=' + id + '&slide=' + startFromSlide;
        return;
    }
    
    wasPresPausedForQuestion = false;
    const btnResume = document.getElementById('presentation-resume-btn');
    if (btnResume) btnResume.style.display = 'none';
    
    currentCourse = course;
    window.navigateTo('presentation');
    
    const presTitle = document.getElementById('presentation-title');
    if (presTitle) presTitle.innerText = course.title;
    const loadingEl = document.getElementById('presentation-loading');
    const canvasEl = document.getElementById('presentation-canvas');
    if (loadingEl) loadingEl.style.display = 'block';
    if (canvasEl) canvasEl.style.display = 'none';

    // Initialiser le sélecteur de vitesse de présentation
    const speedSelect = document.getElementById('presentation-speed-select');
    if (speedSelect) {
        speedSelect.value = String(currentPresentationSpeed);
    }

    // Boutons de téléchargement standardisés dans le header de présentation
    const presDlPdf = document.getElementById('presentation-download-pdf');
    if (presDlPdf) {
        if (course.pdf_url) {
            presDlPdf.href = `/api/courses/${course.id}/download/pdf${currentUser ? '?user_id=' + currentUser.id : ''}`;
            presDlPdf.style.display = 'inline-flex';
            presDlPdf.onclick = () => { if (typeof trackDocumentDownload === 'function') trackDocumentDownload(course.id, 'PDF'); };
        } else {
            presDlPdf.style.display = 'none';
        }
    }
    const presDlPptx = document.getElementById('presentation-download-pptx');
    if (presDlPptx) {
        if (course.pptx_url) {
            presDlPptx.href = `/api/courses/${course.id}/download/pptx${currentUser ? '?user_id=' + currentUser.id : ''}`;
            presDlPptx.style.display = 'inline-flex';
            presDlPptx.onclick = () => { if (typeof trackDocumentDownload === 'function') trackDocumentDownload(course.id, 'PPTX'); };
        } else {
            presDlPptx.style.display = 'none';
        }
    }

    // Le panneau de questions est masqué par défaut à l'ouverture du cours (Section 32)
    const chatSide = document.getElementById('presentation-chat-side');
    if (chatSide) chatSide.style.display = 'none';
    const btnPresToggleChat = document.getElementById('presentation-toggle-chat');
    if (btnPresToggleChat) {
        btnPresToggleChat.innerText = 'Afficher les questions';
        btnPresToggleChat.onclick = () => {
            const chatSideEl = document.getElementById('presentation-chat-side');
            if (chatSideEl) {
                const isHidden = (chatSideEl.style.display === 'none' || getComputedStyle(chatSideEl).display === 'none');
                chatSideEl.style.display = isHidden ? 'flex' : 'none';
                btnPresToggleChat.innerText = isHidden ? 'Masquer les questions' : 'Afficher les questions';
                setTimeout(() => {
                    if (presentationPdfDoc) renderPresentationPage(presentationPageNum);
                }, 60);
            }
        };
    }

    // Le bouton Évaluation n'est visible que si la personne a déjà terminé la formation
    const presEvalBtn = document.getElementById('presentation-eval-btn');
    if (presEvalBtn) {
        const hasFollowed = Boolean(course.has_completed_training || course.user_evaluation);
        presEvalBtn.style.display = hasFollowed ? 'inline-flex' : 'none';
    }
    closePresentationEndModal();
    
    // 1. Charger le document PDF ou basculer en mode rendu autonome
    presentationPdfDoc = null;
    window.renderPresentationFallbackPage = null;
    if (course.pdf_url) {
        const url = course.pdf_url;
        pdfjsLib.getDocument(url).promise.then(doc => {
            presentationPdfDoc = doc;
            presentationTotalPages = doc.numPages;
            presentationPageNum = Math.min(startFromSlide, doc.numPages);
            initPresResizeObserver();
            requestAnimationFrame(() => {
                renderPresentationPage(presentationPageNum);
            });
        }).catch(err => {
            console.warn("Erreur PDF présentation, basculement en mode diapositives HTML/Canvas:", err);
            renderPresentationSlidesFallback(course, startFromSlide);
        });
    } else {
        renderPresentationSlidesFallback(course, startFromSlide);
    }
    
    // 2. Initialiser l'audio et les timestamps
    const presAudio = document.getElementById('presentation-audio');
    const audioStatus = document.getElementById('presentation-audio-status');
    presentationTimestamps = [];
    
    if (presAudio) {
        presAudio.onended = () => {
            if (audioStatus) audioStatus.innerText = "Présentation terminée";
            handlePresentationCompleted();
            saveCurrentCourseProgress(course.id, presentationTotalPages || 1, presentationTotalPages || 1, 'presentation', true);
        };
        presAudio.onplay = () => {
            const btnResume = document.getElementById('presentation-resume-btn');
            if (btnResume) btnResume.style.display = 'none';
            const ragAudio = document.getElementById('rag-audio-player');
            if (ragAudio && !ragAudio.paused) {
                ragAudio.pause();
            }
            wasPresPausedForQuestion = false;
        };
    }
    
    if (presAudio && course.audio_url) {
        presAudio.src = course.audio_url.startsWith('http') ? course.audio_url : course.audio_url;
        presAudio.preservesPitch = true;
        presAudio.mozPreservesPitch = true;
        presAudio.webkitPreservesPitch = true;
        presAudio.playbackRate = currentPresentationSpeed;
        if (audioStatus) audioStatus.innerText = "Audio prêt";
        
        // Charger les timestamps pour synchronisation automatique
        if (course.timestamps_url) {
            const tsUrl = course.timestamps_url.startsWith('http') ? course.timestamps_url : course.timestamps_url;
            fetch(tsUrl)
                .then(r => r.json())
                .then(data => {
                    presentationTimestamps = data;
                    if (audioStatus) audioStatus.innerText = "Synchronisé avec la voix";
                    
                    // Si reprise de progression, caler l'audio sur la diapositive cible
                    if (startFromSlide > 1) {
                        const targetSlide = presentationTimestamps.find(s => s.page === startFromSlide);
                        if (targetSlide) {
                            presAudio.currentTime = targetSlide.start;
                            presAudio.play().catch(e => console.log("Autoplay:", e));
                        }
                    }
                    
                    presAudio.ontimeupdate = () => {
                        const currentTime = presAudio.currentTime;
                        for (let i = 0; i < presentationTimestamps.length; i++) {
                            let slide = presentationTimestamps[i];
                            let isLast = (i === presentationTimestamps.length - 1);
                            if (currentTime >= slide.start && (currentTime < slide.end || (isLast && currentTime <= slide.end))) {
                                if (presentationPageNum !== slide.page) {
                                    presentationPageNum = slide.page;
                                    renderPresentationPage(presentationPageNum);
                                    saveCurrentCourseProgress(course.id, presentationPageNum, presentationTotalPages || presentationTimestamps.length, 'presentation');
                                }
                                break;
                            }
                        }
                    };
                })
                .catch(e => console.error("Erreur timestamps:", e));
        }
    } else if (presAudio) {
        presAudio.removeAttribute('src');
        if (audioStatus) audioStatus.innerText = "Aucun audio disponible";
    }
}

let currentPresRenderTask = null;

function renderPresentationSlidesFallback(course, startFromSlide = 1) {
    let slides = course.slides_data || [];
    if (typeof slides === 'string') {
        try { slides = JSON.parse(slides); } catch(e) { slides = []; }
    }
    
    if (!slides || slides.length === 0) {
        slides = [
            { titre: course.title || "Formation SGCI", puces: ["Domaine : " + (course.domain || "Général"), "Formation Professionnelle certifiante SGCI"] },
            { titre: "Sommaire de la formation", puces: ["1. Présentation et Enjeux", "2. Principes & Application", "3. Synthèse Opérationnelle"] },
            { titre: "Présentation et Enjeux", puces: ["Maîtrise des concepts clés et des règles métiers", "Conformité prudentielle aux exigences de la Banque"] },
            { titre: "Synthèse & Recommandations", puces: ["Application des bonnes pratiques au quotidien", "Validation des acquis par l'évaluation finale"] }
        ];
    }

    const hasSpecialCover = !slides[0] || (slides[0].titre !== course.title);
    const totalPages = slides.length + (hasSpecialCover ? 2 : 0);
    
    presentationTotalPages = totalPages;
    presentationPageNum = Math.min(Math.max(1, startFromSlide), totalPages);
    
    window.renderPresentationFallbackPage = function(num) {
        presentationPageNum = num;
        try {
            sessionStorage.setItem('ia_formation_presentation_slide', num);
            localStorage.setItem('ia_formation_presentation_slide', num);
        } catch(e) {}
        
        const canvas = document.getElementById('presentation-canvas');
        const loadingEl = document.getElementById('presentation-loading');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const pdfBox = document.getElementById('presentation-pdf-box');
        
        const isFs = !!document.fullscreenElement;
        const boxW = isFs ? window.innerWidth : (pdfBox ? pdfBox.clientWidth : 1000);
        const boxH = isFs ? window.innerHeight : (pdfBox ? pdfBox.clientHeight : 600);
        
        const availW = Math.max(boxW - 16, 400);
        const availH = Math.max(boxH - 16, 250);
        
        let w = availW;
        let h = Math.round(w * (9 / 16));
        if (h > availH) {
            h = availH;
            w = Math.round(h * (16 / 9));
        }
        
        const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        
        ctx.save();
        ctx.scale(dpr, dpr);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = '#E9041E';
        ctx.fillRect(0, 0, w, 6);
        
        let slideTitle = course.title || "Formation";
        let puces = [];
        
        if (num === 1 && hasSpecialCover) {
            slideTitle = course.title || "Formation SGCI";
            puces = ["Domaine : " + (course.domain || "SGCI Academy"), "Module de Formation Professionnelle", "Accompagnement par Tuteur IA T-chIA"];
        } else if (num === 2 && hasSpecialCover) {
            slideTitle = "Sommaire de la formation";
            puces = slides.map((s, idx) => `${idx + 1}. ${s.titre || 'Module ' + (idx + 1)}`);
        } else {
            const slideIdx = hasSpecialCover ? (num - 3) : (num - 1);
            const currentSlideData = slides[slideIdx] || slides[0] || {};
            slideTitle = currentSlideData.titre || ("Module " + num);
            puces = currentSlideData.puces || [];
        }
        
        ctx.fillStyle = '#E9041E';
        ctx.fillRect(Math.round(w * 0.05), Math.round(h * 0.08), 4, Math.round(h * 0.08));
        
        ctx.fillStyle = '#0F172A';
        ctx.font = `bold ${Math.round(h * 0.055)}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(slideTitle, Math.round(w * 0.05) + 14, Math.round(h * 0.12));
        
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(w * 0.05), Math.round(h * 0.18));
        ctx.lineTo(Math.round(w * 0.95), Math.round(h * 0.18));
        ctx.stroke();
        
        const cardStartY = Math.round(h * 0.22);
        const cardAvailH = Math.round(h * 0.65);
        const nPuces = Math.max(1, puces.length);
        const gap = Math.round(h * 0.02);
        const cardH = Math.min(Math.round(h * 0.16), Math.floor((cardAvailH - (nPuces - 1) * gap) / nPuces));
        
        puces.forEach((pText, pIdx) => {
            const curY = cardStartY + pIdx * (cardH + gap);
            const cardX = Math.round(w * 0.05);
            const cardW = Math.round(w * 0.90);
            
            ctx.fillStyle = '#F8FAFC';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(cardX, curY, cardW, cardH, 6);
            } else {
                ctx.rect(cardX, curY, cardW, cardH);
            }
            ctx.fill();
            ctx.strokeStyle = '#E2E8F0';
            ctx.stroke();
            
            ctx.fillStyle = '#E9041E';
            ctx.fillRect(cardX + 8, curY + 6, 3, cardH - 12);
            
            ctx.fillStyle = '#0F172A';
            ctx.font = `${Math.round(h * 0.038)}px Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            let textClean = String(pText).replace(/^[•\-\*]\s*/, '');
            ctx.fillText(textClean, cardX + 22, curY + Math.round(cardH / 2), cardW - 35);
        });
        
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(w * 0.05), Math.round(h * 0.90));
        ctx.lineTo(Math.round(w * 0.95), Math.round(h * 0.90));
        ctx.stroke();
        
        ctx.fillStyle = '#64748B';
        ctx.font = `${Math.round(h * 0.03)}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText("Société Générale Côte d'Ivoire  •  T-chIA  •  " + (course.title || ''), Math.round(w * 0.05), Math.round(h * 0.94));
        
        ctx.fillStyle = '#0F172A';
        ctx.font = `bold ${Math.round(h * 0.032)}px Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`${num} / ${totalPages}`, Math.round(w * 0.95), Math.round(h * 0.94));
        
        ctx.restore();
        
        if (loadingEl) loadingEl.style.display = 'none';
        canvas.style.display = 'block';
        
        const pageInfo = document.getElementById('presentation-page-info');
        if (pageInfo) pageInfo.innerText = `${num} / ${totalPages}`;
        
        const fsPageInfo = document.getElementById('fs-page-info');
        if (fsPageInfo) fsPageInfo.innerText = `${num} / ${totalPages}`;
        
        const progBar = document.getElementById('presentation-progress-bar');
        if (progBar) {
            progBar.style.width = ((num / totalPages) * 100) + '%';
        }
    };
    
    initPresResizeObserver();
    renderPresentationFallbackPage(presentationPageNum);
}

function renderPresentationPage(num) {
    if (!presentationPdfDoc) {
        if (typeof window.renderPresentationFallbackPage === 'function') {
            window.renderPresentationFallbackPage(num);
        }
        return;
    }
    presentationPageNum = num;
    try {
        sessionStorage.setItem('ia_formation_presentation_slide', num);
        localStorage.setItem('ia_formation_presentation_slide', num);
    } catch(e) {}
    presentationPdfDoc.getPage(num).then(page => {
        const canvas = document.getElementById('presentation-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const pdfBox = document.getElementById('presentation-pdf-box');
        
        // Annuler tout rendu précédent en cours pour éviter les clignotements ou conflits
        if (currentPresRenderTask) {
            try { currentPresRenderTask.cancel(); } catch (e) {}
            currentPresRenderTask = null;
        }

        const isFs = !!document.fullscreenElement;
        const boxW = isFs ? window.innerWidth : (pdfBox ? pdfBox.clientWidth : 1000);
        const boxH = isFs ? window.innerHeight : (pdfBox ? pdfBox.clientHeight : 600);

        // Marge minimale en mode normal (0px en plein écran pour occuper 100% de la surface)
        const pad = isFs ? 0 : 8;
        const availW = Math.max(boxW - pad, 200);
        const availH = Math.max(boxH - pad, 150);

        // Calcul du meilleur ratio d'échelle pour remplir au maximum le conteneur
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scaleX = availW / unscaledViewport.width;
        const scaleY = availH / unscaledViewport.height;
        const optimalScale = Math.min(scaleX, scaleY);

        // Facteur DPR (Device Pixel Ratio) pour une netteté cristalline (HD / Retina)
        const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
        const viewport = page.getViewport({ scale: optimalScale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Dimensions CSS réelles pour occuper exactement tout l'espace calculé
        const displayW = Math.round(unscaledViewport.width * optimalScale);
        const displayH = Math.round(unscaledViewport.height * optimalScale);
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;
        
        currentPresRenderTask = page.render({ canvasContext: ctx, viewport: viewport });
        currentPresRenderTask.promise.then(() => {
            const loadingEl = document.getElementById('presentation-loading');
            if (loadingEl) loadingEl.style.display = 'none';
            canvas.style.display = 'block';
            currentPresRenderTask = null;
        }).catch(err => {
            if (err && err.name !== 'RenderingCancelledException') {
                console.error("Erreur rendu diapositive:", err);
            }
        });
        
        const pageInfo = document.getElementById('presentation-page-info');
        if (pageInfo) pageInfo.innerText = `${num} / ${presentationTotalPages}`;

        const fsPageInfo = document.getElementById('fs-page-info');
        if (fsPageInfo) fsPageInfo.innerText = `${num} / ${presentationTotalPages}`;
        
        const progBar = document.getElementById('presentation-progress-bar');
        if (progBar) {
            const pct = (num / presentationTotalPages) * 100;
            progBar.style.width = pct + '%';
        }
    });
}

function jumpToPresentationSlide(page) {
    const presAudio = document.getElementById('presentation-audio');
    if (presAudio && presentationTimestamps && presentationTimestamps.length > 0) {
        const slide = presentationTimestamps.find(s => s.page === page);
        if (slide) {
            presAudio.currentTime = slide.start;
            presAudio.play().catch(e => console.log("Autoplay:", e));
        }
    }
    if (currentCourse) {
        saveCurrentCourseProgress(currentCourse.id, page, presentationTotalPages || 1, 'presentation', (page >= presentationTotalPages));
    }
}

function togglePresentationFullscreen() {
    const pdfBox = document.getElementById('presentation-pdf-box');
    if (!pdfBox) return;
    if (!document.fullscreenElement) {
        if (pdfBox.requestFullscreen) {
            pdfBox.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
        } else if (pdfBox.webkitRequestFullscreen) {
            pdfBox.webkitRequestFullscreen();
        } else if (pdfBox.msRequestFullscreen) {
            pdfBox.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}
window.togglePresentationFullscreen = togglePresentationFullscreen;

function togglePresentationStageTheme() {
    const pdfBox = document.getElementById('presentation-pdf-box');
    if (!pdfBox) return;
    pdfBox.classList.toggle('dark-stage');
}
window.togglePresentationStageTheme = togglePresentationStageTheme;

let presResizeObserver = null;
function initPresResizeObserver() {
    const pdfBox = document.getElementById('presentation-pdf-box');
    if (!pdfBox || presResizeObserver) return;
    try {
        presResizeObserver = new ResizeObserver((entries) => {
            const isPresActive = document.getElementById('page-presentation')?.classList.contains('active');
            if (isPresActive && presentationPdfDoc) {
                clearTimeout(presResizeDebounce);
                presResizeDebounce = setTimeout(() => {
                    renderPresentationPage(presentationPageNum);
                }, 50);
            }
        });
        presResizeObserver.observe(pdfBox);
    } catch (e) {
        console.warn("ResizeObserver non supporté:", e);
    }
}
window.initPresResizeObserver = initPresResizeObserver;

// Détecteur de bascule plein écran
function handleFullscreenChange() {
    const isFs = !!document.fullscreenElement;
    const btnFs = document.getElementById('presentation-fullscreen');
    if (btnFs) {
        btnFs.innerHTML = isFs ? 'Réduire' : 'Plein écran';
    }
    const fsOverlay = document.getElementById('fullscreen-controls-overlay');
    if (fsOverlay) {
        fsOverlay.style.display = isFs ? 'flex' : 'none';
    }
    if (presentationPdfDoc) {
        setTimeout(() => {
            renderPresentationPage(presentationPageNum);
        }, 100);
    }
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

// Redimensionnement automatique de la fenêtre pour toujours occuper 100% de l'espace
let presResizeDebounce = null;
window.addEventListener('resize', () => {
    const isPresActive = document.getElementById('page-presentation')?.classList.contains('active');
    if (isPresActive && presentationPdfDoc) {
        clearTimeout(presResizeDebounce);
        presResizeDebounce = setTimeout(() => {
            renderPresentationPage(presentationPageNum);
        }, 120);
    }
});

// Navigation au clavier pour le mode présentation
document.addEventListener('keydown', (e) => {
    const isPresActive = document.getElementById('page-presentation')?.classList.contains('active');
    if (!isPresActive) return;

    // Ne pas intercepter si l'utilisateur est en train d'écrire dans un champ de texte
    if (document.activeElement && (document.activeElement.id === 'rag-chat-input' || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
    }

    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        const btnNext = document.getElementById('presentation-next');
        if (btnNext) btnNext.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        const btnPrev = document.getElementById('presentation-prev');
        if (btnPrev) btnPrev.click();
    } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        togglePresentationFullscreen();
    }
});

// Contrôles présentation principaux
const btnPresPrev = document.getElementById('presentation-prev');
if (btnPresPrev) {
    btnPresPrev.onclick = () => {
        if (presentationPageNum > 1) {
            presentationPageNum--;
            renderPresentationPage(presentationPageNum);
            jumpToPresentationSlide(presentationPageNum);
            if (currentCourse) {
                saveCurrentCourseProgress(currentCourse.id, presentationPageNum, presentationTotalPages || 1, 'presentation');
            }
        }
    };
}

const btnPresNext = document.getElementById('presentation-next');
if (btnPresNext) {
    btnPresNext.onclick = () => {
        if (presentationPdfDoc && presentationPageNum < presentationTotalPages) {
            presentationPageNum++;
            renderPresentationPage(presentationPageNum);
            jumpToPresentationSlide(presentationPageNum);
            if (currentCourse) {
                saveCurrentCourseProgress(currentCourse.id, presentationPageNum, presentationTotalPages, 'presentation', (presentationPageNum === presentationTotalPages));
            }
            if (presentationPageNum === presentationTotalPages) {
                const presAudio = document.getElementById('presentation-audio');
                if (!presAudio || !presAudio.src || presAudio.paused) {
                    handlePresentationCompleted();
                }
            }
        } else if (presentationPdfDoc && presentationPageNum >= presentationTotalPages) {
            handlePresentationCompleted();
        }
    };
}

function handlePresentationCompleted() {
    if (!currentCourse) return;

    // 1. Débloquer et afficher le bouton Évaluation dans le header de présentation
    const presEvalBtn = document.getElementById('presentation-eval-btn');
    if (presEvalBtn) {
        presEvalBtn.style.display = 'inline-flex';
    }

    // 1b. Débloquer le bouton Évaluation en Mode Live (Hologramme)
    if (typeof updateLiveEvalBtnState === 'function') {
        updateLiveEvalBtnState(true);
    }

    // 2. Mémoriser localement que la formation a été suivie
    currentCourse.has_completed_training = true;
    const courseInList = courses.find(c => c.id === currentCourse.id);
    if (courseInList) {
        courseInList.has_completed_training = true;
    }

    // 3. Débloquer le mode évaluation dans la modale de choix
    const evalCard = document.getElementById('mode-card-evaluation');
    if (evalCard) {
        evalCard.style.display = 'block';
    }

    // 4. Enregistrer la complétion sur le serveur (uniquement pour les apprenants)
    const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
    if (currentUser && currentUser.id && !isAdminOrSuper) {
        fetch(`/api/courses/${currentCourse.id}/complete_training`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        }).catch(err => console.warn("Erreur complete_training:", err));

        saveCurrentCourseProgress(currentCourse.id, presentationTotalPages || 1, presentationTotalPages || 1, 'presentation', true);
    }

    // 5. Afficher la modale de félicitations et d'accès au Quiz (uniquement pour les apprenants)
    if (!isAdminOrSuper) {
        const endModal = document.getElementById('presentation-end-modal');
        const courseTitleEl = document.getElementById('presentation-end-course-title');
        if (courseTitleEl) {
            courseTitleEl.innerText = `Félicitations pour avoir suivi "${currentCourse.title}". Vous pouvez désormais valider vos acquis en passant le Quiz d'évaluation.`;
        }
        if (endModal && document.getElementById('page-presentation')?.classList.contains('active') && endModal.style.display !== 'flex') {
            endModal.style.display = 'flex';
        }
    }
}
window.handlePresentationCompleted = handlePresentationCompleted;

window.startEvaluationFromEndModal = function() {
    closePresentationEndModal();
    if (currentCourse) {
        startCurrentCourseEvaluation();
    }
};

window.restartPresentation = function() {
    closePresentationEndModal();
    if (currentCourse && currentUser && currentUser.id) {
        fetch(`/api/courses/${currentCourse.id}/reset_progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        }).catch(err => console.warn("Erreur reset_progress:", err));
        if (currentCourse.user_progress) {
            currentCourse.user_progress.current_slide = 1;
            currentCourse.user_progress.progress_percent = 0.0;
        }
    }
    presentationPageNum = 1;
    renderPresentationPage(1);
    jumpToPresentationSlide(1);
};

window.closePresentationEndModal = function() {
    const endModal = document.getElementById('presentation-end-modal');
    if (endModal) {
        endModal.style.display = 'none';
    }
};

const btnPresFullscreen = document.getElementById('presentation-fullscreen');
if (btnPresFullscreen) {
    btnPresFullscreen.onclick = () => {
        togglePresentationFullscreen();
    };
}

// Contrôles superposés en mode plein écran
const fsBtnPrev = document.getElementById('fs-btn-prev');
if (fsBtnPrev) fsBtnPrev.onclick = () => btnPresPrev?.click();

const fsBtnNext = document.getElementById('fs-btn-next');
if (fsBtnNext) fsBtnNext.onclick = () => btnPresNext?.click();

const fsBtnExit = document.getElementById('fs-btn-exit');
if (fsBtnExit) fsBtnExit.onclick = () => togglePresentationFullscreen();

const btnPresToggleChat = document.getElementById('presentation-toggle-chat');
if (btnPresToggleChat) {
    btnPresToggleChat.onclick = () => {
        const chatSide = document.getElementById('presentation-chat-side');
        if (chatSide) {
            const isHidden = (chatSide.style.display === 'none' || getComputedStyle(chatSide).display === 'none');
            chatSide.style.display = isHidden ? 'flex' : 'none';
            btnPresToggleChat.innerText = isHidden ? 'Masquer les questions' : 'Afficher les questions';
            // Réadapter la largeur de la diapositive dès que le chat est affiché ou masqué
            setTimeout(() => {
                if (presentationPdfDoc) renderPresentationPage(presentationPageNum);
            }, 60);
        }
    };
}

window.startPresentationMode = startPresentationMode;

