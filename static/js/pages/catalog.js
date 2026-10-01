// =========================================================================
// PAGE CATALOGUE : CONSULTATION DES FORMATIONS, FILTRES, MODALE DE CHOIX
// =========================================================================

async function loadCourses() {
    try {
        const userIdParam = currentUser ? `?user_id=${currentUser.id}` : '';
        const response = await fetch(`/api/courses${userIdParam}`);
        if (response.ok) {
            courses = await response.json();
            renderCatalog();
            if (typeof restoreActiveCourseIfApplicable === 'function') {
                restoreActiveCourseIfApplicable();
            }
            if (typeof initCreationPage === 'function' && document.getElementById('page-creation')) {
                initCreationPage();
            }
        }
    } catch(e) {
        console.error("Erreur de chargement depuis la DB Python:", e);
    }
}

function setCatalogFilter(filter) {
    window.currentCatalogFilter = filter;
    document.getElementById('tab-all-courses')?.classList.toggle('active', filter === 'all');
    document.getElementById('tab-assigned-courses')?.classList.toggle('active', filter === 'assigned');
    renderCatalog();
}

function filterCatalogCourses() {
    window.catalogSearchQuery = (document.getElementById('course-search-input')?.value || '').toLowerCase().trim();
    renderCatalog();
}

function renderCatalog() {
    const catalog = document.getElementById('course-catalog');
    if (!catalog) return;
    
    // Mettre à jour les compteurs d'onglets
    const totalCount = courses.length;
    const assignedCount = courses.filter(c => c.is_assigned).length;
    
    const totalBadge = document.getElementById('total-courses-badge');
    if (totalBadge) totalBadge.innerText = totalCount;
    const assignedBadge = document.getElementById('assigned-courses-badge');
    if (assignedBadge) assignedBadge.innerText = assignedCount;
    
    // Filtrage des cours
    let filtered = courses;
    if (window.currentCatalogFilter === 'assigned') {
        filtered = filtered.filter(c => c.is_assigned);
    }
    
    if (window.catalogSearchQuery) {
        filtered = filtered.filter(c => {
            return (c.title || '').toLowerCase().includes(window.catalogSearchQuery) ||
                   (c.desc || '').toLowerCase().includes(window.catalogSearchQuery) ||
                   (c.domain || '').toLowerCase().includes(window.catalogSearchQuery) ||
                   (c.level || '').toLowerCase().includes(window.catalogSearchQuery) ||
                   (c.target_directions || '').toLowerCase().includes(window.catalogSearchQuery) ||
                   (c.target_postes || '').toLowerCase().includes(window.catalogSearchQuery);
        });
    }

    if (filtered.length === 0) {
        if (window.currentCatalogFilter === 'assigned') {
            catalog.innerHTML = '<p class="empty-msg">Aucune formation ne vous a été assignée pour le moment.</p>';
        } else {
            catalog.innerHTML = '<p class="empty-msg">Aucune formation disponible pour le moment.</p>';
        }
        updateDashboard();
        return;
    }
    
    let html = '';
    filtered.forEach(course => {
        const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
        
        // Tag de visibilité pour les administrateurs
        let visibilityBadge = '';
        let targetDetailHtml = '';
        if (isAdminOrSuper) {
            if (course.visibility === 'targeted') {
                let targets = [];
                if (course.target_directions) targets.push(`Dir: ${course.target_directions}`);
                if (course.target_postes) targets.push(`Postes: ${course.target_postes}`);
                let targetText = targets.join(' | ') || 'Ciblé';
                visibilityBadge = `<span class="badge-visibility-targeted" title="${targetText}">Ciblé</span>`;
                targetDetailHtml = `<div class="course-target-detail">${targetText}</div>`;
            } else if (course.visibility === 'assigned') {
                visibilityBadge = `<span class="badge-visibility-assigned">Sur assignation</span>`;
            } else {
                visibilityBadge = `<span class="badge-visibility-public">Public</span>`;
            }
        }

        const thumbnailHtml = course.thumbnail_url 
            ? `<img src="${course.thumbnail_url}" alt="${course.title || 'Formation'}">`
            : `<div class="thumbnail-placeholder">${course.domain || 'Formation'}</div>`;

        const hasDownloads = Boolean(course.pdf_url || course.pptx_url);

        html += `
        <div class="course-card ${course.is_assigned ? 'course-card-assigned' : ''}">
            <div class="course-card-thumbnail">
                ${thumbnailHtml}
                <div class="course-thumbnail-overlay-top">
                    <span class="course-domain-badge">${course.domain || 'Général'}</span>
                    ${visibilityBadge}
                </div>
                ${course.is_assigned ? '<div class="course-assigned-floating-badge">Assignée</div>' : ''}
                ${(!isAdminOrSuper && course.user_evaluation) ? `<div style="position: absolute; bottom: 8px; right: 8px; background: ${course.user_evaluation.passed ? '#000000' : '#e9041e'}; color: white; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">${Math.round(course.user_evaluation.score)}%</div>` : ''}
            </div>

            <div class="course-card-body">
                <div>
                    <h3 class="course-card-title" title="${course.title || ''}">${course.title || 'Sans titre'}</h3>
                    <p class="course-card-desc" title="${course.desc || ''}">${course.desc || 'Aucune description disponible.'}</p>
                    
                    <div class="course-meta-row">
                        <div class="course-meta-item">
                            <span class="meta-label">Durée</span>
                            <span class="meta-value">${course.duration || 0} h</span>
                        </div>
                        <div class="course-meta-divider"></div>
                        <div class="course-meta-item">
                            <span class="meta-label">Niveau</span>
                            <span class="meta-value">${course.level || 'Débutant'}</span>
                        </div>
                        <div class="course-meta-divider"></div>
                        <div class="course-meta-item">
                            <span class="meta-label">Tuteur</span>
                            <span class="meta-value" style="color: #000000; font-weight: 700;">${course.tutor_name || 'IA'}</span>
                        </div>
                    </div>

                    ${targetDetailHtml}
                    ${(() => {
                        if (isAdminOrSuper) return '';
                        if (course.has_completed_training) {
                            return `
                            <div style="margin-top: 8px; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 11.5px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 700; color: #000000; display: inline-flex; align-items: center; gap: 5px;">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    Formation terminée
                                </span>
                                <strong style="color: #000000;">100%</strong>
                            </div>`;
                        } else if (course.user_progress && course.user_progress.current_slide > 1) {
                            const curS = course.user_progress.current_slide;
                            const totS = course.user_progress.total_slides || 1;
                            const pct = Math.round(course.user_progress.progress_percent || ((curS / totS) * 100));
                            return `
                            <div style="margin-top: 8px; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 11.5px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="font-weight: 700; color: #e9041e; display: inline-flex; align-items: center; gap: 4px;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e9041e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                        En cours : Slide ${curS}/${totS}
                                    </span>
                                    <strong style="color: #475569;">${pct}%</strong>
                                </div>
                                <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                    <div style="height: 100%; background: #e9041e; width: ${pct}%;"></div>
                                </div>
                            </div>`;
                        }
                        return '';
                    })()}
                    ${(!isAdminOrSuper && course.user_evaluation) ? `
                    <div style="margin-top: 8px; padding: 6px 10px; background: ${course.user_evaluation.passed ? '#f8fafc' : '#fff5f5'}; border: 1px solid ${course.user_evaluation.passed ? '#cbd5e1' : '#fca5a5'}; border-radius: 8px; font-size: 11.5px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: ${course.user_evaluation.passed ? '#000000' : '#e9041e'};">
                            ${course.user_evaluation.passed ? 'Test Validé' : 'Test à consolider'}
                        </span>
                        <strong style="color: #0f172a;">Score: ${Math.round(course.user_evaluation.score)}%</strong>
                    </div>
                    ` : ''}
                </div>

                <div class="course-card-actions-wrapper">
                    <button onclick="viewCourse(${course.id})" class="btn-primary-consult">
                        <span>${isAdminOrSuper ? 'Aperçu' : 'Lancer la formation'}</span>
                    </button>

                    ${hasDownloads ? `
                    <div class="course-downloads-row">
                        ${course.pdf_url ? `
                            <a href="/api/courses/${course.id}/download/pdf${currentUser ? '?user_id=' + currentUser.id : ''}" 
                               class="btn-download-pdf" 
                               onclick="if(typeof trackDocumentDownload==='function') trackDocumentDownload(${course.id}, 'PDF');"
                               title="Télécharger le support de cours officiel archivé (PDF)">
                                Support PDF
                            </a>
                        ` : ''}
                        ${course.pptx_url ? `
                            <a href="/api/courses/${course.id}/download/pptx${currentUser ? '?user_id=' + currentUser.id : ''}" 
                               class="btn-download-pptx" 
                               onclick="if(typeof trackDocumentDownload==='function') trackDocumentDownload(${course.id}, 'PPTX');"
                               title="Télécharger la présentation officielle archivée (PPTX)">
                                PPTX
                            </a>
                        ` : ''}
                    </div>
                    ` : ''}

                    ${isAdminOrSuper ? `
                    <div class="course-admin-actions-row">
                        <button onclick="editCourse(${course.id})" class="btn-admin-edit" title="Modifier cette formation">
                            Modifier
                        </button>
                        <button onclick="deleteCourse(${course.id})" class="btn-admin-delete" title="Supprimer cette formation">
                            Supprimer
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    });
    catalog.innerHTML = html;
    
    // Mettre à jour le dashboard à chaque rendu
    updateDashboard();
}

let domainChartInstance = null;


// --- GESTION DES ACTIONS SUR FORMATION (MODAL CHOIX DU MODE & SUPPRESSION) ---
window.viewCourse = function(id) {
    const course = courses.find(c => c.id == id);
    if (!course) return;
    
    selectedCourseForModal = course;
    const modal = document.getElementById('consultation-mode-modal');
    const modalHeading = document.getElementById('consultation-modal-heading');
    const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
    if (modalHeading) {
        modalHeading.innerText = isAdminOrSuper ? "Aperçu de la formation" : "Lancer la formation";
    }
    const titleEl = document.getElementById('modal-course-title');
    if (titleEl) titleEl.innerText = `${course.title} • (${course.domain || 'Formation'})`;

    const isLearner = currentUser && currentUser.role === 'user';
    const evalBadgeEl = document.getElementById('modal-eval-status-badge');
    if (evalBadgeEl) {
        if (isLearner && course.user_evaluation) {
            const isPassed = course.user_evaluation.passed;
            evalBadgeEl.innerHTML = `Dernier score : <strong>${Math.round(course.user_evaluation.score)}%</strong> (${isPassed ? 'Validé' : 'À consolider'})`;
            evalBadgeEl.style.color = isPassed ? '#000000' : '#e9041e';
        } else {
            evalBadgeEl.innerText = 'Test noté & Bilan personnalisé';
            evalBadgeEl.style.color = '#000000';
        }
    }

    const evalCard = document.getElementById('mode-card-evaluation');
    if (evalCard) {
        const canAccessEval = isAdminOrSuper || Boolean(course.has_completed_training || course.user_evaluation);
        evalCard.style.display = canAccessEval ? 'block' : 'none';
    }

    // Gestion de la bannière et des boutons de reprise de progression
    const resumeBanner = document.getElementById('modal-resume-banner');
    const resumeSlideText = document.getElementById('modal-resume-slide-text');
    const resumePctBadge = document.getElementById('modal-resume-pct-badge');
    const resumeProgBar = document.getElementById('modal-resume-progress-bar');
    const btnPresResume = document.getElementById('btn-pres-resume');
    const btnPresRestart = document.getElementById('btn-pres-restart');
    const btnLiveResume = document.getElementById('btn-live-resume');
    const btnLiveRestart = document.getElementById('btn-live-restart');

    const uProg = isLearner ? course.user_progress : null;
    const hasProgress = Boolean(isLearner && uProg && uProg.current_slide > 1 && !course.has_completed_training);
    const hasFinished = Boolean(isLearner && course.has_completed_training);

    if (hasProgress) {
        const curS = uProg.current_slide;
        const totS = uProg.total_slides || 1;
        const pct = Math.round(uProg.progress_percent || ((curS / totS) * 100));

        if (resumeBanner) resumeBanner.style.display = 'block';
        if (resumeSlideText) resumeSlideText.innerText = `${curS} sur ${totS}`;
        if (resumePctBadge) resumePctBadge.innerText = `${pct}%`;
        if (resumeProgBar) resumeProgBar.style.width = `${pct}%`;

        if (btnPresResume) btnPresResume.innerHTML = `▶ Reprendre la Présentation (Slide ${curS})`;
        if (btnPresRestart) btnPresRestart.style.display = 'inline-flex';

        if (btnLiveResume) btnLiveResume.innerHTML = isAdminOrSuper ? `Démarrer l'Aperçu en Interaction Directe` : `Démarrer l'Interaction Directe`;
        if (btnLiveRestart) btnLiveRestart.style.display = 'none';
    } else if (hasFinished) {
        if (resumeBanner) resumeBanner.style.display = 'block';
        if (resumeSlideText) resumeSlideText.innerText = `Intégralité suivie`;
        if (resumePctBadge) resumePctBadge.innerText = `100% ✓`;
        if (resumeProgBar) resumeProgBar.style.width = `100%`;

        if (btnPresResume) btnPresResume.innerHTML = `▶ Revoir la Présentation`;
        if (btnPresRestart) btnPresRestart.style.display = 'none';

        if (btnLiveResume) btnLiveResume.innerHTML = isAdminOrSuper ? `Démarrer l'Aperçu en Interaction Directe` : `Démarrer l'Interaction Directe`;
        if (btnLiveRestart) btnLiveRestart.style.display = 'none';
    } else {
        if (resumeBanner) resumeBanner.style.display = 'none';
        if (btnPresResume) btnPresResume.innerHTML = isAdminOrSuper ? `▶ Lancer l'Aperçu de la Présentation` : `▶ Lancer la Présentation`;
        if (btnPresRestart) btnPresRestart.style.display = 'none';

        if (btnLiveResume) btnLiveResume.innerHTML = isAdminOrSuper ? `Démarrer l'Aperçu en Interaction Directe` : `Démarrer l'Interaction Directe`;
        if (btnLiveRestart) btnLiveRestart.style.display = 'none';
    }

    if (modal) modal.style.display = 'flex';
};

window.closeConsultationModeModal = function() {
    const modal = document.getElementById('consultation-mode-modal');
    if (modal) modal.style.display = 'none';
};

window.restartSelectedCourseMode = async function(mode) {
    if (!selectedCourseForModal) return;
    const courseId = selectedCourseForModal.id;
    if (currentUser && currentUser.id) {
        try {
            await fetch(`/api/courses/${courseId}/reset_progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUser.id })
            });
        } catch (e) {
            console.warn("Erreur reset_progress:", e);
        }
    }
    if (selectedCourseForModal.user_progress) {
        selectedCourseForModal.user_progress.current_slide = 1;
        selectedCourseForModal.user_progress.progress_percent = 0.0;
    }
    launchSelectedMode(mode, false);
};

window.launchSelectedMode = function(mode, resume = false) {
    closeConsultationModeModal();
    if (!selectedCourseForModal) return;
    
    let resumeSlide = 1;
    if (resume && selectedCourseForModal.user_progress && selectedCourseForModal.user_progress.current_slide > 1) {
        resumeSlide = selectedCourseForModal.user_progress.current_slide;
    }
    
    if (mode === 'presentation') {
        startPresentationMode(selectedCourseForModal.id, resumeSlide);
    } else if (mode === 'evaluation') {
        startEvaluationMode(selectedCourseForModal.id);
    } else {
        // En mode Live (Gemini Live), pas de suivi de progression rigide par slide : démarrage direct et naturel
        startLiveTutorMode(selectedCourseForModal.id);
    }
};


// --- SUPPRESSION D'UNE FORMATION ---
window.deleteCourse = async function(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette formation ?")) {
        try {
            await fetch('/api/courses/' + id, { method: 'DELETE' });
            await loadCourses();
        } catch(e) {
            console.error("Erreur suppression:", e);
        }
    }
};

