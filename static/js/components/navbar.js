// =========================================================================
// COMPOSANT : BARRE DE NAVIGATION, MENU DEROULANT UTILISATEUR & BADGES
// =========================================================================

// --- MENU DEROULANT UTILISATEUR & PROFIL ---
function toggleUserDropdown(event, forceState) {
    if (event && event.stopPropagation) {
        event.stopPropagation();
    }
    const menu = document.getElementById('user-dropdown-card');
    const chevron = document.getElementById('user-menu-chevron');
    if (!menu) return;

    const isCurrentlyVisible = menu.style.display !== 'none';
    const shouldShow = (forceState !== undefined) ? forceState : !isCurrentlyVisible;
    
    if (shouldShow) {
        menu.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        menu.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}
window.toggleUserDropdown = toggleUserDropdown;

// Fermeture automatique du menu au clic en dehors
document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('user-menu-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        toggleUserDropdown(null, false);
    }
});

function handleMenuAssignments() {
    if (!currentUser) return;
    const isAdminOrSuper = currentUser.role === 'admin' || currentUser.role === 'superadmin';
    if (isAdminOrSuper) {
        navigateTo('assignments');
    } else {
        navigateTo('consultation');
        if (typeof setCatalogFilter === 'function') {
            setCatalogFilter('assigned');
        }
    }
}
window.handleMenuAssignments = handleMenuAssignments;

