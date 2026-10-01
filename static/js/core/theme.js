// =========================================================================
// MODULE CORE : GESTION DES THEMES VISUELS (BLANC, GRIS SLATE, NOIR)
// =========================================================================

// --- GESTION DU THÈME VISUEL (BLANC, GRIS, NOIR) ---
window.setAppTheme = function(themeName) {
    const validThemes = ['blanc', 'gris', 'noir'];
    const theme = validThemes.includes(themeName) ? themeName : 'blanc';
    
    if (document.body) {
        document.body.classList.remove('theme-blanc', 'theme-gris', 'theme-noir');
        document.body.classList.add(`theme-${theme}`);
    }

    validThemes.forEach(t => {
        const btn = document.getElementById(`theme-btn-${t}`);
        if (btn) {
            if (t === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    try {
        localStorage.setItem('tchia_theme', theme);
    } catch (e) {
        console.warn("Erreur sauvegarde thème:", e);
    }
};

window.initAppTheme = function() {
    let saved = 'blanc';
    try {
        saved = localStorage.getItem('tchia_theme') || 'blanc';
    } catch (e) {
        saved = 'blanc';
    }
    window.setAppTheme(saved);
};

window.initAppTheme();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initAppTheme());
}

