// =========================================================================
// MODULE CORE : AUTHENTIFICATION, SESSIONS & RGPD CONSENTEMENT
// =========================================================================

async function performLogin() {
    const userInput = document.getElementById('login-user').value.trim();
    const passInput = document.getElementById('login-pass').value.trim();
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    
    if (!userInput || !passInput) {
        errorEl.innerText = "Veuillez renseigner votre matricule et votre mot de passe.";
        errorEl.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identifier: userInput, 
                matricule: userInput, 
                username: userInput, 
                password: passInput
            })
        });
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            try {
                sessionStorage.setItem('ia_formation_user', JSON.stringify(currentUser));
                localStorage.setItem('ia_formation_user', JSON.stringify(currentUser));
                document.cookie = `ia_user_role=${currentUser.role}; path=/; max-age=86400; SameSite=Lax`;
                document.cookie = `ia_user_id=${currentUser.id}; path=/; max-age=86400; SameSite=Lax`;
            } catch(e) {}
            
            // Si l'utilisateur est sur la page /login, rediriger directement vers /
            if (window.location.pathname === '/login') {
                window.location.href = '/dashboard';
                return;
            }
            
            // Vérification obligatoire du Disclosure & Consentement RGPD / AI Act (Section 14)
            try {
                const cRes = await fetch(`/api/user/consent-status?user_id=${currentUser.id}`);
                const cData = await cRes.json();
                if (!cData.accepted) {
                    const lScr = document.getElementById('login-screen');
                    if (lScr) lScr.style.display = 'none';
                    const dMod = document.getElementById('disclosure-modal');
                    if (dMod) dMod.style.display = 'flex';
                    return;
                }
            } catch (eConsent) {
                console.warn("Erreur vérification consentement:", eConsent);
            }
            
            applyAuthState();
        } else {
            errorEl.innerText = data.error || "Matricule ou mot de passe incorrect";
            errorEl.style.display = 'block';
        }
    } catch (e) {
        console.error("Login error:", e);
        errorEl.innerText = "Erreur de connexion au serveur";
        errorEl.style.display = 'block';
    }
}

window.validateConsentCheckboxes = function() {
    const c1 = document.getElementById('consent-check-1')?.checked;
    const c2 = document.getElementById('consent-check-2')?.checked;
    const c3 = document.getElementById('consent-check-3')?.checked;
    const btn = document.getElementById('btn-accept-disclosure');
    if (!btn) return;
    
    if (c1 && c2 && c3) {
        btn.disabled = false;
        btn.style.background = '#e9041e';
        btn.style.color = '#ffffff';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 4px 14px rgba(233, 4, 30, 0.3)';
    } else {
        btn.disabled = true;
        btn.style.background = '#cbd5e1';
        btn.style.color = '#64748b';
        btn.style.cursor = 'not-allowed';
        btn.style.boxShadow = 'none';
    }
};

window.submitUserConsent = async function() {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/user/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                disclosure_version: '1.0',
                status: 'accepted'
            })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('disclosure-modal').style.display = 'none';
            applyAuthState();
        } else {
            alert("Erreur lors de l'enregistrement du consentement.");
        }
    } catch (e) {
        console.error("submitUserConsent error:", e);
        alert("Erreur de connexion au serveur pour l'enregistrement du consentement.");
    }
};

window.trackDocumentDownload = function(courseId, docType) {
    if (!currentUser) return;
    fetch('/api/downloads/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: currentUser.id,
            course_id: courseId,
            doc_type: docType
        })
    }).catch(e => console.warn("Track download error:", e));
};

function performLogout() {
    toggleUserDropdown(null, false);
    closeUserProfileModal();
    currentUser = null;
    _lastRestoredKey = null;
    try {
        sessionStorage.clear();
        localStorage.clear();
        document.cookie = 'ia_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        document.cookie = 'ia_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    } catch (e) {}
    
    fetch('/api/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/login';
    });
}

