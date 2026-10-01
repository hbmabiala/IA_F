// =========================================================================
// PAGE ASSIGNATIONS : MOTEUR DE REGLES DYNAMIQUES, BULK ASSIGN & MATRICE
// =========================================================================

// =========================================================================
// MOTEUR D'ASSIGNATION DÉDIÉ : RÈGLES DYNAMIQUES, BULK ASSIGN & MATRICE
// =========================================================================

window.assignmentRules = [];
window.assignmentsMatrix = [];
window.selectedRuleCourseIds = new Set();
window.selectedManualCourseIds = new Set();
window.selectedManualUserIds = new Set();
window.currentAssignmentTab = 'rules';

window.switchAssignmentTab = function(tabName) {
    window.currentAssignmentTab = tabName;
    ['rules', 'manual', 'matrix'].forEach(t => {
        const sec = document.getElementById(`assignment-section-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (sec) sec.style.display = (t === tabName) ? 'block' : 'none';
        if (btn) {
            if (t === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    if (tabName === 'rules') {
        loadAssignmentRules();
    } else if (tabName === 'manual') {
        loadManualAssignData();
    } else if (tabName === 'matrix') {
        loadAssignmentsMatrix();
    }
};

window.loadAssignmentPageData = function() {
    loadUsers();
    loadCourses();
    window.switchAssignmentTab(window.currentAssignmentTab || 'rules');
};

// --- 1. RÈGLES & PARCOURS AUTOMATIQUES ---

async function loadAssignmentRules() {
    try {
        const res = await fetch('/api/assignment_rules?t=' + new Date().getTime());
        if (res.ok) {
            window.assignmentRules = await res.json();
            const badge = document.getElementById('rules-count-badge');
            if (badge) badge.innerText = window.assignmentRules.length;
            renderAssignmentRules();
        }
    } catch (e) {
        console.error("loadAssignmentRules error:", e);
    }
}

function renderAssignmentRules() {
    const grid = document.getElementById('assignment-rules-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (window.assignmentRules.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; background: white; padding: 40px 20px; text-align: center; border-radius: 12px; border: 1px dashed #cbd5e1;">
                <p style="color: #64748b; font-size: 15px; margin: 0 0 15px 0;">Aucun parcours d'attribution automatique n'est actuellement configuré.</p>
                <button onclick="openNewRuleModal()" class="submit-btn" style="width: auto; padding: 10px 22px; display: inline-block;">
                    Créer le premier Parcours Dynamique
                </button>
            </div>
        `;
        return;
    }

    window.assignmentRules.forEach(rule => {
        const courseIds = rule.course_ids_list || [];
        const courseNames = courseIds.map(cid => {
            const found = courses.find(c => c.id == cid);
            return found ? found.title : `Cours #${cid}`;
        });

        const dirTag = rule.target_direction ? `Dir: <strong>${rule.target_direction}</strong>` : 'Toutes les directions';
        const posteTag = rule.target_poste ? `Poste: <strong>${rule.target_poste}</strong>` : 'Tous les postes';
        const contratTag = rule.target_contrat ? `Statut: <strong>${rule.target_contrat}</strong>` : 'Tous contrats';
        const ancTag = rule.max_anciennete_days ? `< ${rule.max_anciennete_days}j d'ancienneté` : 'Toute ancienneté';

        grid.innerHTML += `
            <div class="rule-card">
                <div>
                    <div class="rule-header">
                        <div>
                            <span class="tag-auto-rule">PARCOURS AUTOMATIQUE</span>
                            <h3 style="margin: 8px 0 4px 0; color: #0f172a; font-size: 17px; font-weight: 700;">${rule.name}</h3>
                            ${rule.description ? `<p style="margin: 0; color: #64748b; font-size: 12px;">${rule.description}</p>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0;">
                        <span class="rule-criteria-badge">${dirTag}</span>
                        <span class="rule-criteria-badge">${posteTag}</span>
                        <span class="rule-criteria-badge">${contratTag}</span>
                        <span class="rule-criteria-badge">${ancTag}</span>
                    </div>

                    <div class="rule-courses-list">
                        <strong style="color: #0f172a; display: block; margin-bottom: 5px;">${courseIds.length} Formation(s) incluse(s) :</strong>
                        <ul style="margin: 0; padding-left: 18px;">
                            ${courseNames.slice(0, 4).map(cn => `<li>${cn}</li>`).join('')}
                            ${courseNames.length > 4 ? `<li><em>...et ${courseNames.length - 4} autre(s)</em></li>` : ''}
                        </ul>
                    </div>
                </div>

                <div class="rule-footer">
                    <span style="font-size: 12px; color: #000000; font-weight: 700; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1;">
                        ${rule.matched_users_count || 0} collaborateur(s) couvert(s)
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="syncRule(${rule.id})" class="action-btn-sm" title="Forcer la réévaluation / synchronisation" style="background: #000000; color: #ffffff;">Sync</button>
                        <button onclick="openEditRuleModal(${rule.id})" class="action-btn-sm btn-edit" title="Modifier">Modifier</button>
                        <button onclick="deleteRule(${rule.id}, '${rule.name.replace(/'/g, "\\'")}')" class="action-btn-sm btn-delete" title="Supprimer">Supprimer</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function openNewRuleModal() {
    document.getElementById('rule-id').value = '';
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-target-direction').value = '';
    document.getElementById('rule-target-poste').value = '';
    document.getElementById('rule-target-contrat').value = '';
    document.getElementById('rule-max-anciennete').value = '';
    document.getElementById('rule-course-search').value = '';
    document.getElementById('rule-modal-msg').innerText = '';
    document.getElementById('rule-modal-title').innerText = "Créer un Parcours d'Attribution Automatique";
    window.selectedRuleCourseIds = new Set();
    
    renderRuleCoursesSelection();
    updateRuleMatchPreview();
    document.getElementById('rule-modal').style.display = 'flex';
}

function openEditRuleModal(id) {
    const rule = window.assignmentRules.find(r => r.id === id);
    if (!rule) return;

    document.getElementById('rule-id').value = rule.id;
    document.getElementById('rule-name').value = rule.name || '';
    document.getElementById('rule-target-direction').value = rule.target_direction || '';
    document.getElementById('rule-target-poste').value = rule.target_poste || '';
    document.getElementById('rule-target-contrat').value = rule.target_contrat || '';
    document.getElementById('rule-max-anciennete').value = rule.max_anciennete_days || '';
    document.getElementById('rule-course-search').value = '';
    document.getElementById('rule-modal-msg').innerText = '';
    document.getElementById('rule-modal-title').innerText = "Modifier le Parcours Dynamique";

    window.selectedRuleCourseIds = new Set(rule.course_ids_list || []);
    renderRuleCoursesSelection();
    updateRuleMatchPreview();
    document.getElementById('rule-modal').style.display = 'flex';
}

function closeRuleModal() {
    document.getElementById('rule-modal').style.display = 'none';
    window.selectedRuleCourseIds = new Set();
}

function renderRuleCoursesSelection() {
    const container = document.getElementById('rule-courses-selection-list');
    if (!container) return;
    const query = (document.getElementById('rule-course-search')?.value || '').toLowerCase().trim();

    const filtered = courses.filter(c => {
        if (!query) return true;
        return (c.title || '').toLowerCase().includes(query) ||
               (c.domain || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; font-style: italic; text-align: center; padding: 10px;">Aucun cours trouvé.</p>';
        return;
    }

    container.innerHTML = filtered.map(c => {
        const isChecked = window.selectedRuleCourseIds.has(c.id);
        return `
            <div class="course-checkbox-item ${isChecked ? 'checked' : ''}" onclick="toggleRuleCourseCheckbox(${c.id})">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleRuleCourseCheckbox(${c.id});" style="cursor: pointer; accent-color: #e9041e;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${c.title}</div>
                    <div style="font-size: 11px; color: #64748b;">${c.domain || 'Général'} • ${c.duration || 0}h • ${c.level || 'Débutant'}</div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleRuleCourseCheckbox(courseId) {
    if (window.selectedRuleCourseIds.has(courseId)) {
        window.selectedRuleCourseIds.delete(courseId);
    } else {
        window.selectedRuleCourseIds.add(courseId);
    }
    renderRuleCoursesSelection();
}

function calculateAncienneteDaysJs(dateStr) {
    if (!dateStr) return 0;
    try {
        const d = new Date(dateStr.split(' ')[0]);
        const now = new Date();
        const diffTime = Math.abs(now - d);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } catch (e) {
        return 0;
    }
}

function updateRuleMatchPreview() {
    const dir = (document.getElementById('rule-target-direction')?.value || '').toLowerCase().trim();
    const poste = (document.getElementById('rule-target-poste')?.value || '').toLowerCase().trim();
    const contrat = (document.getElementById('rule-target-contrat')?.value || '').toLowerCase().trim();
    const maxAncStr = document.getElementById('rule-max-anciennete')?.value || '';
    const maxAnc = maxAncStr ? parseInt(maxAncStr) : null;

    const matchedUsers = (window.allUsers || []).filter(u => {
        if (u.role === 'admin' || u.role === 'superadmin') return false;
        
        const uDir = (u.direction || '').toLowerCase().trim();
        const uPoste = (u.poste || '').toLowerCase().trim();
        const uContrat = (u.statut_contrat || '').toLowerCase().trim();
        const uDays = calculateAncienneteDaysJs(u.date_embauche);

        if (dir && !uDir.includes(dir) && !dir.includes(uDir)) return false;
        if (poste && !uPoste.includes(poste) && !poste.includes(uPoste)) return false;
        if (contrat && uContrat !== contrat) return false;
        if (maxAnc !== null && uDays > maxAnc) return false;
        return true;
    });

    const textEl = document.getElementById('rule-preview-text');
    if (textEl) {
        textEl.innerText = `${matchedUsers.length} collaborateur(s) actif(s) correspondent actuellement à ces critères.`;
    }
}

async function saveRule() {
    const id = document.getElementById('rule-id').value;
    const name = document.getElementById('rule-name').value.trim();
    const target_direction = document.getElementById('rule-target-direction').value.trim();
    const target_poste = document.getElementById('rule-target-poste').value.trim();
    const target_contrat = document.getElementById('rule-target-contrat').value;
    const max_anciennete_days = document.getElementById('rule-max-anciennete').value || null;
    const course_ids = Array.from(window.selectedRuleCourseIds);
    const msg = document.getElementById('rule-modal-msg');

    if (!name) {
        msg.style.color = '#dc2626';
        msg.innerText = "Le nom du parcours est obligatoire.";
        return;
    }
    if (course_ids.length === 0) {
        msg.style.color = '#dc2626';
        msg.innerText = "Veuillez sélectionner au moins une formation pour ce parcours.";
        return;
    }

    try {
        const payload = {
            name, target_direction, target_poste, target_contrat,
            max_anciennete_days: max_anciennete_days ? parseInt(max_anciennete_days) : null,
            course_ids,
            created_by: currentUser ? currentUser.id : 1
        };

        const url = id ? `/api/assignment_rules/${id}` : '/api/assignment_rules';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            msg.style.color = '#000000';
            msg.innerText = "Parcours enregistré et synchronisé avec succès !";
            loadAssignmentRules();
            loadUsers();
            setTimeout(() => { closeRuleModal(); }, 800);
        } else {
            msg.style.color = '#dc2626';
            msg.innerText = data.error || "Erreur lors de l'enregistrement.";
        }
    } catch (e) {
        console.error("saveRule error:", e);
        msg.style.color = '#dc2626';
        msg.innerText = "Erreur de communication avec le serveur.";
    }
}

async function deleteRule(id, name) {
    if (!confirm(`Voulez-vous vraiment supprimer le parcours automatique [${name}] ?`)) return;
    try {
        const res = await fetch(`/api/assignment_rules/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadAssignmentRules();
        } else {
            alert(data.error || "Erreur lors de la suppression.");
        }
    } catch (e) {
        console.error("deleteRule error:", e);
    }
}

async function syncRule(id) {
    try {
        const res = await fetch(`/api/assignment_rules/${id}/sync`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert("Synchronisation effectuée ! Tous les collaborateurs correspondants ont reçu les formations.");
            loadAssignmentRules();
            loadUsers();
        }
    } catch (e) {
        console.error("syncRule error:", e);
    }
}

// --- 2. ASSIGNATION PONCTUELLE MULTICRITÈRES ---

function loadManualAssignData() {
    window.selectedManualCourseIds = new Set();
    window.selectedManualUserIds = new Set();
    renderManualCoursesSelection();
    filterManualTargetUsers();
}

function renderManualCoursesSelection() {
    const container = document.getElementById('manual-courses-selection-list');
    if (!container) return;
    const query = (document.getElementById('manual-course-search')?.value || '').toLowerCase().trim();

    const filtered = courses.filter(c => {
        if (!query) return true;
        return (c.title || '').toLowerCase().includes(query) ||
               (c.domain || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; font-style: italic; text-align: center; padding: 10px;">Aucun cours trouvé.</p>';
        updateManualCoursesCountInfo();
        return;
    }

    container.innerHTML = filtered.map(c => {
        const isChecked = window.selectedManualCourseIds.has(c.id);
        return `
            <div class="course-checkbox-item ${isChecked ? 'checked' : ''}" onclick="toggleManualCourseCheckbox(${c.id})">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleManualCourseCheckbox(${c.id});" style="cursor: pointer; accent-color: #e9041e;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${c.title}</div>
                    <div style="font-size: 11px; color: #64748b;">${c.domain || 'Général'} • ${c.duration || 0}h • ${c.level || 'Débutant'}</div>
                </div>
            </div>
        `;
    }).join('');
    updateManualCoursesCountInfo();
}

function toggleManualCourseCheckbox(courseId) {
    if (window.selectedManualCourseIds.has(courseId)) {
        window.selectedManualCourseIds.delete(courseId);
    } else {
        window.selectedManualCourseIds.add(courseId);
    }
    renderManualCoursesSelection();
}

function selectAllManualCourses(checked) {
    if (checked) {
        courses.forEach(c => window.selectedManualCourseIds.add(c.id));
    } else {
        window.selectedManualCourseIds.clear();
    }
    renderManualCoursesSelection();
}

function updateManualCoursesCountInfo() {
    const count = window.selectedManualCourseIds.size;
    const info = document.getElementById('manual-courses-count-info');
    if (info) info.innerText = `${count} formation(s) sélectionnée(s) sur ${courses.length}`;
}

function filterManualTargetUsers() {
    const dir = (document.getElementById('manual-filter-direction')?.value || '').toLowerCase().trim();
    const poste = (document.getElementById('manual-filter-poste')?.value || '').toLowerCase().trim();
    const contrat = (document.getElementById('manual-filter-contrat')?.value || '').toLowerCase().trim();
    const ancStr = document.getElementById('manual-filter-anciennete')?.value || '';
    const maxAnc = ancStr ? parseInt(ancStr) : null;

    const filteredUsers = (window.allUsers || []).filter(u => {
        if (u.role === 'admin' || u.role === 'superadmin') return false;
        
        const uDir = (u.direction || '').toLowerCase().trim();
        const uPoste = (u.poste || '').toLowerCase().trim();
        const uContrat = (u.statut_contrat || '').toLowerCase().trim();
        const uDays = calculateAncienneteDaysJs(u.date_embauche);

        if (dir && !uDir.includes(dir) && !dir.includes(uDir)) return false;
        if (poste && !uPoste.includes(poste) && !poste.includes(uPoste)) return false;
        if (contrat && uContrat !== contrat) return false;
        if (maxAnc !== null && uDays > maxAnc) return false;
        return true;
    });

    const tbody = document.getElementById('manual-target-users-tbody');
    const countEl = document.getElementById('manual-target-users-count');
    if (countEl) countEl.innerText = filteredUsers.length;

    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8; font-style: italic;">
                    Aucun collaborateur ne correspond à ces critères.
                </td>
            </tr>
        `;
        return;
    }

    filteredUsers.forEach(u => {
        const isChecked = window.selectedManualUserIds.has(u.id);
        const nomComplet = `${u.nom || ''} ${u.prenom || ''}`.trim() || '-';
        const dateEmbaucheDisplay = u.date_embauche ? u.date_embauche.split(' ')[0] : '-';

        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 12px; text-align: center;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleManualUserCheckbox(${u.id})" style="cursor: pointer; accent-color: #e9041e;">
                </td>
                <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${u.matricule || '-'}</td>
                <td style="padding: 10px 12px;"><strong>${nomComplet}</strong></td>
                <td style="padding: 10px 12px;">${u.direction || '-'}</td>
                <td style="padding: 10px 12px;">${u.poste || '-'}</td>
                <td style="padding: 10px 12px;"><span class="tag tag-domain" style="font-size: 11px;">${u.statut_contrat || 'CDI'}</span></td>
                <td style="padding: 10px 12px; font-size: 12px; color: #64748b;">${dateEmbaucheDisplay}</td>
            </tr>
        `;
    });
}

function toggleManualUserCheckbox(userId) {
    if (window.selectedManualUserIds.has(userId)) {
        window.selectedManualUserIds.delete(userId);
    } else {
        window.selectedManualUserIds.add(userId);
    }
}

function selectAllManualUsers(checked) {
    const dir = (document.getElementById('manual-filter-direction')?.value || '').toLowerCase().trim();
    const poste = (document.getElementById('manual-filter-poste')?.value || '').toLowerCase().trim();
    const contrat = (document.getElementById('manual-filter-contrat')?.value || '').toLowerCase().trim();
    const ancStr = document.getElementById('manual-filter-anciennete')?.value || '';
    const maxAnc = ancStr ? parseInt(ancStr) : null;

    const filteredUsers = (window.allUsers || []).filter(u => {
        if (u.role === 'admin' || u.role === 'superadmin') return false;
        const uDir = (u.direction || '').toLowerCase().trim();
        const uPoste = (u.poste || '').toLowerCase().trim();
        const uContrat = (u.statut_contrat || '').toLowerCase().trim();
        const uDays = calculateAncienneteDaysJs(u.date_embauche);

        if (dir && !uDir.includes(dir) && !dir.includes(uDir)) return false;
        if (poste && !uPoste.includes(poste) && !poste.includes(uPoste)) return false;
        if (contrat && uContrat !== contrat) return false;
        if (maxAnc !== null && uDays > maxAnc) return false;
        return true;
    });

    if (checked) {
        filteredUsers.forEach(u => window.selectedManualUserIds.add(u.id));
    } else {
        filteredUsers.forEach(u => window.selectedManualUserIds.delete(u.id));
    }
    filterManualTargetUsers();
}

async function executeManualBulkAssign() {
    const user_ids = Array.from(window.selectedManualUserIds);
    const course_ids = Array.from(window.selectedManualCourseIds);
    const msg = document.getElementById('manual-assign-msg');

    if (course_ids.length === 0) {
        msg.style.color = '#dc2626';
        msg.innerText = "Veuillez cocher au moins une formation.";
        return;
    }
    if (user_ids.length === 0) {
        msg.style.color = '#dc2626';
        msg.innerText = "Veuillez cocher au moins un collaborateur ciblé.";
        return;
    }

    msg.style.color = '#e9041e';
    msg.innerText = "Assignation en cours...";

    try {
        const res = await fetch('/api/manual_bulk_assign', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_ids,
                course_ids,
                assigned_by: currentUser ? currentUser.id : 1
            })
        });
        const data = await res.json();

        if (data.success) {
            msg.style.color = '#000000';
            msg.innerText = `Succès ! Formations assignées aux ${user_ids.length} collaborateurs.`;
            loadUsers();
            setTimeout(() => {
                msg.innerText = '';
                window.switchAssignmentTab('matrix');
            }, 1200);
        } else {
            msg.style.color = '#dc2626';
            msg.innerText = data.error || "Erreur lors de l'assignation.";
        }
    } catch (e) {
        console.error("executeManualBulkAssign error:", e);
        msg.style.color = '#dc2626';
        msg.innerText = "Erreur de communication avec le serveur.";
    }
}

// --- 3. MATRICE DE SUIVI & RÉVOCATION ---

async function loadAssignmentsMatrix() {
    try {
        const res = await fetch('/api/assignments_matrix?t=' + new Date().getTime());
        if (res.ok) {
            window.assignmentsMatrix = await res.json();
            const badge = document.getElementById('matrix-count-badge');
            if (badge) badge.innerText = window.assignmentsMatrix.length;
            filterMatrixTable();
        }
    } catch (e) {
        console.error("loadAssignmentsMatrix error:", e);
    }
}

function filterMatrixTable() {
    const query = (document.getElementById('matrix-search')?.value || '').toLowerCase().trim();
    if (!query) {
        renderMatrixTable(window.assignmentsMatrix);
        return;
    }

    const filtered = window.assignmentsMatrix.filter(row => {
        const mat = (row.matricule || '').toLowerCase();
        const nom = (row.nom || '').toLowerCase();
        const prenom = (row.prenom || '').toLowerCase();
        const course = (row.course_title || '').toLowerCase();
        const dir = (row.direction || '').toLowerCase();
        const poste = (row.poste || '').toLowerCase();
        const rule = (row.rule_name || '').toLowerCase();

        return mat.includes(query) ||
               nom.includes(query) ||
               prenom.includes(query) ||
               course.includes(query) ||
               dir.includes(query) ||
               poste.includes(query) ||
               rule.includes(query);
    });

    renderMatrixTable(filtered);
}

function renderMatrixTable(rows) {
    const tbody = document.getElementById('matrix-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8; font-style: italic;">
                    Aucune assignation trouvée.
                </td>
            </tr>
        `;
        return;
    }

    rows.forEach(r => {
        const nomComplet = `${r.nom || ''} ${r.prenom || ''}`.trim() || '-';
        const dateDisplay = r.assigned_at ? r.assigned_at.split(' ')[0] : '-';
        const sourceBadge = r.source_rule_id && r.rule_name
            ? `<span class="tag-auto-rule">Parcours: ${r.rule_name}</span>`
            : `<span class="tag-manual">Manuelle</span>`;

        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 16px;">
                    <div style="font-weight: 700; color: #0f172a;">${nomComplet}</div>
                    <div style="font-size: 11px; color: #64748b;">Matricule: ${r.matricule || '-'}</div>
                </td>
                <td style="padding: 12px 16px;">
                    <div>${r.direction || '-'}</div>
                    <div style="font-size: 11px; color: #64748b;">${r.poste || '-'}</div>
                </td>
                <td style="padding: 12px 16px;"><span class="tag tag-domain" style="font-size: 11px;">${r.statut_contrat || 'CDI'}</span></td>
                <td style="padding: 12px 16px; font-weight: 600; color: #000000;">
                    ${r.course_title}
                </td>
                <td style="padding: 12px 16px;">${sourceBadge}</td>
                <td style="padding: 12px 16px; font-size: 12px; color: #64748b;">${dateDisplay}</td>
                <td style="padding: 12px 16px; text-align: center;">
                    <button onclick="revokeAssignment(${r.assignment_id}, '${nomComplet.replace(/'/g, "\\'")}', '${r.course_title.replace(/'/g, "\\'")}')" class="action-btn-sm btn-delete" title="Révoquer l'accès">Révoquer</button>
                </td>
            </tr>
        `;
    });
}

async function revokeAssignment(id, userName, courseTitle) {
    if (!confirm(`Voulez-vous retirer l'accès de [${userName}] à la formation [${courseTitle}] ?`)) return;
    try {
        const res = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadAssignmentsMatrix();
            loadUsers();
        } else {
            alert(data.error || "Erreur lors de la révocation.");
        }
    } catch (e) {
        console.error("revokeAssignment error:", e);
    }
}

