// =========================================================================
// MODULE CORE : NAVIGATION PERSISTANTE, ROUTEUR & RESTAURATION (F5)
// =========================================================================

// --- AUTHENTIFICATION & NAVIGATION PERSISTANTE ---
function getSavedPage() {
    try {
        const path = (window.location.pathname || '').replace(/^\//, '').trim();
        if (path === 'catalogue' || path === 'consultation') return 'consultation';
        if (path && document.getElementById('page-' + path)) return path;
        
        // Détecter la page présente dans le DOM
        const domPage = document.querySelector('.page');
        if (domPage && domPage.id) {
            return domPage.id.replace(/^page-/, '');
        }

        const hash = (window.location.hash || '').replace(/^#/, '').trim();
        if (hash && document.getElementById('page-' + hash)) {
            return hash;
        }
        const sp = sessionStorage.getItem('ia_formation_current_page');
        if (sp && document.getElementById('page-' + sp)) return sp;
        const lp = localStorage.getItem('ia_formation_current_page');
        if (lp && document.getElementById('page-' + lp)) return lp;
    } catch(e) {}
    return null;
}
window.getSavedPage = getSavedPage;

function applyAuthState(forcePage) {
    if (!currentUser) {
        const saved = sessionStorage.getItem('ia_formation_user') || localStorage.getItem('ia_formation_user');
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
            } catch(e) {}
        }
    }
    if (!currentUser) {
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
        return;
    }
    const loginSc = document.getElementById('login-screen');
    if (loginSc) loginSc.style.display = 'none';
    const isDetailsActive = document.getElementById('page-details')?.classList.contains('active');
    const mainNav = document.getElementById('main-nav');
    if (mainNav) mainNav.style.display = isDetailsActive ? 'none' : 'flex';
    
    // Calcul des initiales, du prénom et du nom complet
    const prenom = (currentUser.prenom || '').trim();
    const nom = (currentUser.nom || '').trim();
    const displayName = prenom || nom || currentUser.username || currentUser.matricule || 'Utilisateur';
    const fullName = `${prenom} ${nom}`.trim() || displayName;
    const initials = ((prenom.charAt(0) || '') + (nom.charAt(0) || currentUser.matricule?.charAt(0) || 'U')).toUpperCase();

    // Mise à jour de l'affichage déclencheur du menu utilisateur : UNIQUEMENT LE PRÉNOM
    const userDisplayEl = document.getElementById('current-user-display');
    if (userDisplayEl) userDisplayEl.innerText = displayName;

    const navAvatarEl = document.getElementById('nav-user-avatar');
    if (navAvatarEl) navAvatarEl.innerText = initials;

    // Mise à jour de l'en-tête du menu déroulant
    const dropdownAvatarEl = document.getElementById('dropdown-user-avatar');
    if (dropdownAvatarEl) dropdownAvatarEl.innerText = initials;

    const dropdownNameEl = document.getElementById('dropdown-user-name');
    if (dropdownNameEl) dropdownNameEl.innerText = fullName;

    const dropdownMatriculeEl = document.getElementById('dropdown-user-matricule');
    if (dropdownMatriculeEl) dropdownMatriculeEl.innerText = `Matricule : ${currentUser.matricule || 'N/A'}`;

    const dropdownSubEl = document.getElementById('dropdown-user-sub');
    if (dropdownSubEl) dropdownSubEl.innerText = currentUser.email || currentUser.direction || (currentUser.poste || 'Compte Entreprise');

    // Badge de rôle (dans la modale et dans le dropdown)
    const badgeEl = document.getElementById('current-user-role-badge');
    const dropdownBadgeEl = document.getElementById('dropdown-user-role-badge');
    let roleLabel = 'Apprenant';
    let roleClass = 'role-badge role-user';
    if (currentUser.role === 'superadmin') {
        roleLabel = 'Super Admin';
        roleClass = 'role-badge role-superadmin';
    } else if (currentUser.role === 'admin') {
        roleLabel = 'Administrateur';
        roleClass = 'role-badge role-admin';
    }
    if (badgeEl) {
        badgeEl.className = roleClass;
        badgeEl.innerText = roleLabel;
    }
    if (dropdownBadgeEl) {
        dropdownBadgeEl.className = roleClass;
        dropdownBadgeEl.innerText = roleLabel;
    }

    const isSuperAdmin = currentUser.role === 'superadmin';
    const isAdminOrSuper = currentUser.role === 'admin' || currentUser.role === 'superadmin';
    
    // Visibilité des éléments de navigation selon les droits
    const navDashboard = document.getElementById('nav-dashboard');
    if (navDashboard) {
        navDashboard.style.display = 'inline-block';
        navDashboard.innerText = 'Tableau de Bord';
    }
    const navUsers = document.getElementById('nav-users');
    if (navUsers) navUsers.style.display = isAdminOrSuper ? 'inline-block' : 'none';

    // Accès exclusif à l'Évaluation & Benchmark RAG pour le Super Administrateur
    const navRagEval = document.getElementById('nav-rag-eval');
    if (navRagEval) navRagEval.style.display = isSuperAdmin ? 'inline-block' : 'none';
    const dropdownRagEval = document.getElementById('dropdown-rag-eval-btn');
    if (dropdownRagEval) dropdownRagEval.style.display = isSuperAdmin ? 'flex' : 'none';

    // Ancien bouton nav-creation s'il existe encore dans le DOM
    const navCreation = document.getElementById('nav-creation');
    if (navCreation) navCreation.style.display = 'none';

    // Bouton d'action principal 'Créer une formation' dans la page Catalogue
    const catalogBtnCreate = document.getElementById('catalog-btn-create');
    if (catalogBtnCreate) {
        catalogBtnCreate.style.display = isAdminOrSuper ? 'inline-flex' : 'none';
    }

    // Personnalisation de l'élément 'Assignations' dans le menu déroulant
    const assignTitleEl = document.getElementById('dropdown-assignments-title');
    const assignDescEl = document.getElementById('dropdown-assignments-desc');
    if (assignTitleEl && assignDescEl) {
        if (isAdminOrSuper) {
            assignTitleEl.innerText = 'Assignations & Parcours';
            assignDescEl.innerText = 'Piloter les règles et affectations';
        } else {
            assignTitleEl.innerText = 'Mes Formations Assignées';
            assignDescEl.innerText = 'Consulter mes parcours obligatoires';
        }
    }
    
    // Options de rôle dans le formulaire de création et le modal
    const superAdminOptCreate = document.getElementById('role-option-superadmin');
    if (superAdminOptCreate) superAdminOptCreate.style.display = isSuperAdmin ? 'block' : 'none';
    
    const superAdminOptEdit = document.getElementById('edit-role-option-superadmin');
    if (superAdminOptEdit) superAdminOptEdit.style.display = isSuperAdmin ? 'block' : 'none';

    // Restauration intelligente de la page active avant l'actualisation (F5)
    let targetPage = forcePage || getSavedPage();

    // Contrôles de sécurité stricts par rôle
    if (targetPage === 'rag-eval' && !isSuperAdmin) {
        targetPage = 'dashboard';
    } else if ((targetPage === 'users' || targetPage === 'assignments' || targetPage === 'creation') && !isAdminOrSuper) {
        targetPage = 'consultation';
    }

    if (!targetPage) {
        targetPage = isAdminOrSuper ? 'dashboard' : 'consultation';
    }

    navigateTo(targetPage);
    loadCourses();
    if (typeof restoreActiveCourseIfApplicable === 'function') {
        restoreActiveCourseIfApplicable();
    }
}

let _lastRestoredKey = null;

function restoreActiveCourseIfApplicable() {
    if (!currentUser || !courses || courses.length === 0) return;
    const targetPage = getSavedPage();
    if (targetPage !== 'presentation' && targetPage !== 'details' && targetPage !== 'evaluation') {
        return;
    }

    let courseId = null;
    let mode = null;
    try {
        const urlParams = new URLSearchParams(window.location.search);
        courseId = urlParams.get('course_id') || urlParams.get('id');
        if (!courseId) {
            courseId = sessionStorage.getItem('ia_formation_course_id') || localStorage.getItem('ia_formation_course_id');
        }
        mode = sessionStorage.getItem('ia_formation_course_mode') || localStorage.getItem('ia_formation_course_mode');
    } catch(e) {}

    if (!courseId) {
        navigateTo('consultation');
        return;
    }

    const restoreKey = `${targetPage}_${courseId}`;
    if (_lastRestoredKey === restoreKey) return;
    _lastRestoredKey = restoreKey;

    const course = courses.find(c => c.id == courseId);
    if (!course) {
        navigateTo('consultation');
        return;
    }

    currentCourse = course;

    if (targetPage === 'presentation') {
        let slide = 1;
        try {
            const urlParams = new URLSearchParams(window.location.search);
            slide = parseInt(urlParams.get('slide')) || parseInt(sessionStorage.getItem('ia_formation_presentation_slide') || localStorage.getItem('ia_formation_presentation_slide')) || 1;
        } catch(e) {}
        startPresentationMode(course.id, slide);
    } else if (targetPage === 'details') {
        startLiveTutorMode(course.id);
    } else if (targetPage === 'evaluation') {
        startEvaluationMode(course.id);
    }
}
window.restoreActiveCourseIfApplicable = restoreActiveCourseIfApplicable;


// --- NAVIGATION GENERALE ---
// --- NAVIGATION GENERALE ---
window.navigateTo = function(pageId) {
    // Fermer le menu déroulant utilisateur s'il est ouvert
    if (typeof toggleUserDropdown === 'function') {
        toggleUserDropdown(null, false);
    }

    const routeName = (pageId === 'consultation') ? 'catalogue' : pageId;
    const currentPath = (window.location.pathname || '').replace(/^\//, '').trim();

    // Si la page cible n'est pas dans le document HTML actuel, navigation directe vers la route dédiée
    const targetPage = document.getElementById('page-' + pageId);
    if (!targetPage) {
        try {
            sessionStorage.setItem('ia_formation_current_page', pageId);
            localStorage.setItem('ia_formation_current_page', pageId);
        } catch(e) {}
        window.location.href = '/' + routeName;
        return;
    }

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    targetPage.classList.add('active');

    // Mise à jour de l'onglet actif dans la barre de navigation
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const currentNavBtn = document.getElementById('nav-' + pageId);
    if (currentNavBtn) {
        currentNavBtn.classList.add('active');
    }

    // Persistance de la page active pour la préservation lors de l'actualisation (F5)
    try {
        sessionStorage.setItem('ia_formation_current_page', pageId);
        localStorage.setItem('ia_formation_current_page', pageId);
        if (currentPath !== routeName && (currentPath || routeName !== 'dashboard')) {
            history.replaceState(null, '', '/' + routeName);
        }
    } catch (e) {}

    if (pageId !== 'presentation' && pageId !== 'details' && pageId !== 'evaluation') {
        _lastRestoredKey = null;
        try {
            sessionStorage.removeItem('ia_formation_course_mode');
            localStorage.removeItem('ia_formation_course_mode');
        } catch (e) {}
    }
    
    // Gérer l'affichage de la barre de navigation principale
    // Sur la page de l'hologramme ('details'), la barre globale est masquée pour ne garder que la navigation dédiée épurée
    const mainNav = document.getElementById('main-nav');
    if (mainNav && currentUser) {
        mainNav.style.display = (pageId === 'details') ? 'none' : 'flex';
    }

    // Masquer le bouton assistant flottant redondant sur la page de l'hologramme
    const aiAssistant = document.getElementById('ai-assistant');
    if (aiAssistant) {
        aiAssistant.style.display = (pageId === 'details') ? 'none' : 'block';
    }

    if (pageId !== 'presentation') {
        const presAudio = document.getElementById('presentation-audio');
        if (presAudio) presAudio.pause();
        const ragAudio = document.getElementById('rag-audio-player');
        if (ragAudio) ragAudio.pause();
        const btnResume = document.getElementById('presentation-resume-btn');
        if (btnResume) btnResume.style.display = 'none';
    }
    
    if (pageId === 'dashboard') {
        const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
        const adminView = document.getElementById('admin-dashboard-view');
        const userView = document.getElementById('user-dashboard-view');
        if (adminView) adminView.style.display = isAdminOrSuper ? 'flex' : 'none';
        if (userView) userView.style.display = isAdminOrSuper ? 'none' : 'block';
        updateDashboard();
    }
    
    if (pageId === 'users') {
        loadUsers();
    }
    
    if (pageId === 'assignments') {
        loadAssignmentPageData();
    }

    if (pageId === 'rag-eval') {
        if (!currentUser || currentUser.role !== 'superadmin') {
            alert("Accès refusé : Cette page d'évaluation RAG est strictement réservée au Super Administrateur.");
            navigateTo('dashboard');
            return;
        }
        loadRagEvaluationData();
    }
    
    if (pageId === 'creation') {
        if (typeof initCreationPage === 'function') {
            initCreationPage();
        }
    }

    updateAssistantButtonUI();
};


// --- ECOUTEUR CHANGEMENT D'URL HASH (BOUTONS PRECEDENT / SUIVANT) ---
window.addEventListener('hashchange', () => {
    if (!currentUser) return;
    const pageId = (window.location.hash || '').replace(/^#/, '').trim();
    if (pageId && document.getElementById('page-' + pageId)) {
        const currentActive = document.querySelector('.page.active');
        if (currentActive && currentActive.id === 'page-' + pageId) return;
        navigateTo(pageId);
    }
});

