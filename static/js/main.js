// =========================================================================
// POINT D'ENTREE PRINCIPAL : DEMARRAGE DE L'APPLICATION & INITIALISATION
// =========================================================================

// Ping régulier d'activité (Heartbeat en temps réel pour le pilotage RH / Direction)
setInterval(() => {
    if (currentUser && currentUser.id) {
        const activeCId = currentCourse ? currentCourse.id : null;
        fetch('/api/user/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                course_id: activeCId,
                module_id: null
            })
        }).catch(() => {});
    }
}, 45000);

// Vérifier si un utilisateur est déjà connecté (initialisation avec contrôle de consentement RGPD)
let savedUser = null;
try {
    savedUser = sessionStorage.getItem('ia_formation_user') || localStorage.getItem('ia_formation_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
} catch (e) {
    console.error("Erreur parsing savedUser:", e);
}

// Initialisation générale
loadCourses();
updateDashboard();
updateAssistantButtonUI();

if (currentUser) {
    const loginEl = document.getElementById('login-screen');
    if (loginEl) loginEl.style.display = 'none';

    fetch(`/api/user/consent-status?user_id=${currentUser.id}`)
        .then(r => r.json())
        .then(cData => {
            if (cData && !cData.accepted) {
                if (loginEl) loginEl.style.display = 'none';
                document.getElementById('disclosure-modal').style.display = 'flex';
            } else {
                applyAuthState();
            }
        })
        .catch(() => applyAuthState());
}

// Écouteur de changement de hash pour les boutons Précédent / Suivant du navigateur
