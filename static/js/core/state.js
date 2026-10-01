// =========================================================================
// MODULE CORE : ETAT GLOBAL PARTAGE & VARIABLES CENTRALES
// =========================================================================

// --- NAVIGATION & ETAT GLOBAL ---
let courses = [];
let currentUser = null;
window.allUsers = [];
window.currentCatalogFilter = 'all'; // 'all' ou 'assigned'
window.userScopeFilter = 'all'; // 'all' ou 'mine'
window.catalogSearchQuery = '';
window.activeAssignUserId = null;
window.selectedAssignCourseIds = new Set();

