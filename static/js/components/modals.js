// =========================================================================
// COMPOSANT : GESTION DES MODALES GENERALES (PROFIL, HISTORIQUE DES EVALS)
// =========================================================================

function openUserProfileModal() {
    if (!currentUser) return;
    const prenom = (currentUser.prenom || '').trim();
    const nom = (currentUser.nom || '').trim();
    const fullName = `${prenom} ${nom}`.trim() || currentUser.username || currentUser.matricule || 'Utilisateur';
    const initials = ((prenom.charAt(0) || '') + (nom.charAt(0) || currentUser.matricule?.charAt(0) || 'U')).toUpperCase();

    const avatarEl = document.getElementById('profile-modal-avatar');
    if (avatarEl) avatarEl.innerText = initials;

    const nameEl = document.getElementById('profile-modal-fullname');
    if (nameEl) nameEl.innerText = fullName;

    const roleBadgeEl = document.getElementById('profile-modal-role-badge');
    if (roleBadgeEl) {
        let rLabel = 'Apprenant';
        if (currentUser.role === 'superadmin') rLabel = 'Super Administrateur';
        else if (currentUser.role === 'admin') rLabel = 'Administrateur';
        roleBadgeEl.innerText = rLabel;
    }

    const dirPill = document.getElementById('profile-modal-direction-pill');
    if (dirPill) dirPill.innerText = currentUser.direction || 'SGCI';

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val || 'Non renseigné';
    };

    setVal('profile-modal-matricule', currentUser.matricule);
    setVal('profile-modal-email', currentUser.email);
    setVal('profile-modal-direction', currentUser.direction);
    setVal('profile-modal-poste', currentUser.poste);
    setVal('profile-modal-contrat', currentUser.statut_contrat || 'CDI');
    setVal('profile-modal-date', currentUser.date_embauche);
    setVal('profile-modal-manager', currentUser.manager);

    if (typeof loadProfileEvaluations === 'function') {
        loadProfileEvaluations(currentUser.id);
    }

    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'flex';
}
window.openUserProfileModal = openUserProfileModal;

function closeUserProfileModal() {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
}
window.closeUserProfileModal = closeUserProfileModal;


// --- HISTORIQUE DES EVALUATIONS & CERTIFICATIONS DANS LE PROFIL ---
window.loadProfileEvaluations = async function(userId) {
    const listEl = document.getElementById('profile-evals-list');
    const countEl = document.getElementById('profile-evals-count');
    if (!listEl) return;

    listEl.innerHTML = '<div style="font-size: 12px; color: #64748b; font-style: italic;">Chargement de l\'historique...</div>';

    try {
        const res = await fetch(`/api/users/${userId}/evaluations`);
        const data = await res.json();
        if (data.success && data.evaluations && data.evaluations.length > 0) {
            if (countEl) countEl.innerText = `${data.evaluations.length} test(s)`;
            listEl.innerHTML = '';
            data.evaluations.forEach(ev => {
                const item = document.createElement('div');
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12.5px;';
                const isPassed = ev.passed;
                const dFormatted = formatEvaluationDate(ev.completed_at);
                item.innerHTML = `
                    <div style="min-width: 0; flex: 1; padding-right: 10px;">
                        <strong style="color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${ev.course_title}</strong>
                        <span style="font-size: 11px; color: #64748b;">${dFormatted} • Score: <b style="color: ${isPassed ? '#000000' : '#b91c1c'};">${Math.round(ev.score)}%</b></span>
                    </div>
                    <button type="button" onclick="viewHistoricalEvaluation(${ev.course_id}, ${ev.id})" class="action-btn-sm" style="background: #000000; color: white; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; flex-shrink: 0;">
                        Voir bilan
                    </button>
                `;
                listEl.appendChild(item);
            });
        } else {
            if (countEl) countEl.innerText = '0 test';
            listEl.innerHTML = '<div style="font-size: 12px; color: #94a3b8; font-style: italic;">Aucune évaluation enregistrée pour le moment.</div>';
        }
    } catch (e) {
        console.error("Erreur loadProfileEvaluations:", e);
        listEl.innerHTML = '<div style="font-size: 12px; color: #ef4444;">Erreur lors du chargement des évaluations.</div>';
    }
};

window.openEvaluationsHistoryModal = async function() {
    if (!currentUser) {
        alert("Veuillez vous connecter pour consulter vos évaluations.");
        return;
    }
    const modal = document.getElementById('evaluations-history-modal');
    if (modal) modal.style.display = 'flex';

    const listEl = document.getElementById('history-modal-list');
    const emptyEl = document.getElementById('history-modal-empty');
    if (listEl) listEl.innerHTML = '<div style="text-align:center; padding: 25px; color:#64748b; font-size: 14px;">Chargement de votre historique d\'évaluations...</div>';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        const res = await fetch(`/api/users/${currentUser.id}/evaluations`);
        const data = await res.json();
        if (data.success && data.evaluations && data.evaluations.length > 0) {
            if (emptyEl) emptyEl.style.display = 'none';
            if (listEl) {
                listEl.innerHTML = '';
                data.evaluations.forEach(ev => {
                    const card = createEvaluationHistoryCard(ev);
                    listEl.appendChild(card);
                });
            }
        } else {
            if (listEl) listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
        }
    } catch (e) {
        console.error("Erreur openEvaluationsHistoryModal:", e);
        if (listEl) listEl.innerHTML = '<div style="color:#ef4444; text-align:center; padding: 20px;">Erreur de communication avec le serveur.</div>';
    }
};

window.closeEvaluationsHistoryModal = function() {
    const modal = document.getElementById('evaluations-history-modal');
    if (modal) modal.style.display = 'none';
};

window.viewHistoricalEvaluation = async function(courseId, evalId) {
    if (typeof closeEvaluationsHistoryModal === 'function') closeEvaluationsHistoryModal();
    if (typeof closeUserProfileModal === 'function') closeUserProfileModal();

    const course = courses.find(c => c.id == courseId);
    if (course) {
        currentCourse = course;
    }
    window.navigateTo('evaluation');

    document.getElementById('eval-screen-intro').style.display = 'none';
    document.getElementById('eval-screen-questions').style.display = 'none';
    document.getElementById('eval-screen-loading').style.display = 'block';
    document.getElementById('eval-screen-results').style.display = 'none';

    try {
        const res = await fetch(`/api/evaluations/${evalId}`);
        const data = await res.json();
        if (data.success && data.evaluation && data.evaluation.diagnostic) {
            const ev = data.evaluation;
            document.getElementById('eval-course-title').innerText = ev.course_title || (currentCourse ? currentCourse.title : 'Évaluation');
            document.getElementById('eval-course-domain').innerText = ev.course_domain || 'SGCI';

            lastEvalDiagnostic = ev.diagnostic;
            renderEvaluationResults(ev.diagnostic);
        } else {
            alert("Impossible de charger les détails de cette évaluation.");
            window.navigateTo('consultation');
        }
    } catch (e) {
        console.error("Erreur viewHistoricalEvaluation:", e);
        alert("Erreur lors de la récupération des détails.");
        window.navigateTo('consultation');
    }
};

