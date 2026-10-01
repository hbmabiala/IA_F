// =========================================================================
// PAGE UTILISATEURS : GESTION DES APPRENANTS, CRUD, IMPORT CSV & ASSIGNATIONS
// =========================================================================

// --- GESTION DES UTILISATEURS & ASSIGNATIONS ---

async function loadUsers() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
        return;
    }
    try {
        const res = await fetch('/api/users?t=' + new Date().getTime());
        const users = await res.json();
        window.allUsers = users;
        
        const countEl = document.getElementById('users-count');
        if (countEl) countEl.innerText = users.length;
        
        filterUsersTable();
    } catch (e) {
        console.error("loadUsers error:", e);
    }
}

function renderUsersTable(usersList) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (usersList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8; font-style: italic;">
                    Aucun utilisateur trouvé.
                </td>
            </tr>
        `;
        return;
    }
    
    const isSuperAdmin = currentUser && currentUser.role === 'superadmin';
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    usersList.forEach(u => {
        let badgeHtml = '';
        if (u.role === 'superadmin') {
            badgeHtml = '<span class="role-badge role-superadmin">Super Admin</span>';
        } else if (u.role === 'admin') {
            badgeHtml = '<span class="role-badge role-admin">Admin</span>';
        } else {
            badgeHtml = '<span class="role-badge role-user">Apprenant</span>';
        }
        
        const canEdit = isSuperAdmin || (isAdmin && u.role === 'user');
        const canDelete = (isSuperAdmin && u.id !== currentUser.id && (u.role !== 'superadmin' || usersList.filter(x=>x.role==='superadmin').length > 1)) || 
                          (isAdmin && u.role === 'user');

        const nomComplet = `${u.nom || ''} ${u.prenom || ''}`.trim() || '-';
        const emailLine = u.email ? `<div style="font-size: 12px; color: #64748b;">${u.email}</div>` : '';
        const posteDisplay = u.poste ? u.poste : '<span style="color:#94a3b8;">-</span>';
        const directionDisplay = u.direction ? u.direction : '<span style="color:#94a3b8;">-</span>';
        const statutDisplay = u.statut_contrat ? `<span class="tag tag-domain" style="font-size: 11px; padding: 2px 7px;">${u.statut_contrat}</span>` : '<span style="color:#94a3b8;">-</span>';
        const dateEmbaucheDisplay = u.date_embauche ? u.date_embauche.split(' ')[0] : '<span style="color:#94a3b8;">-</span>';
        
        const countAssigned = u.assigned_courses_count || 0;
        const assignedBadge = countAssigned > 0 
            ? `<span class="tag tag-assigned" style="font-size: 11px; padding: 3px 8px;">${countAssigned} cours</span>`
            : `<span style="font-size: 12px; color: #94a3b8;">0</span>`;
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 16px; font-weight: bold; color: #0f172a;">${u.matricule || '-'}</td>
                <td style="padding: 12px 16px;">
                    <strong>${nomComplet}</strong>
                    ${emailLine}
                </td>
                <td style="padding: 12px 16px;">${directionDisplay}</td>
                <td style="padding: 12px 16px;">${posteDisplay}</td>
                <td style="padding: 12px 16px;">${statutDisplay}</td>
                <td style="padding: 12px 16px; font-size: 12px; color: #64748b;">${dateEmbaucheDisplay}</td>
                <td style="padding: 12px 16px;">${badgeHtml}</td>
                <td style="padding: 12px 16px; text-align: center;">${assignedBadge}</td>
                <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
                    ${canEdit ? `<button onclick="openEditUserModal(${u.id})" class="action-btn-sm btn-edit" title="Modifier">Modifier</button>` : ''}
                    ${canDelete ? `<button onclick="deleteUser(${u.id}, '${u.matricule}')" class="action-btn-sm btn-delete" title="Supprimer" style="margin-left: 4px;">Supprimer</button>` : ''}
                </td>
            </tr>
        `;
    });
}

function filterUsersTable() {
    const query = (document.getElementById('user-search')?.value || '').toLowerCase().trim();
    if (!query) {
        renderUsersTable(window.allUsers);
        return;
    }
    
    const filtered = window.allUsers.filter(u => {
        const matricule = (u.matricule || '').toLowerCase();
        const nom = (u.nom || '').toLowerCase();
        const prenom = (u.prenom || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const poste = (u.poste || '').toLowerCase();
        const direction = (u.direction || '').toLowerCase();
        const statut = (u.statut_contrat || '').toLowerCase();
        const role = (u.role || '').toLowerCase();
        
        return matricule.includes(query) ||
               nom.includes(query) ||
               prenom.includes(query) ||
               email.includes(query) ||
               poste.includes(query) ||
               direction.includes(query) ||
               statut.includes(query) ||
               role.includes(query);
    });
    
    renderUsersTable(filtered);
}

window.openCreateUserModal = function() {
    const form = document.getElementById('create-user-form');
    if (form) form.reset();
    const msg = document.getElementById('user-msg');
    if (msg) msg.innerText = '';
    const modal = document.getElementById('create-user-modal');
    if (modal) modal.style.display = 'flex';
};

window.closeCreateUserModal = function() {
    const modal = document.getElementById('create-user-modal');
    if (modal) modal.style.display = 'none';
    const msg = document.getElementById('user-msg');
    if (msg) msg.innerText = '';
};

async function createUser() {
    const matricule = document.getElementById('new-matricule').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const nom = document.getElementById('new-nom').value.trim();
    const prenom = document.getElementById('new-prenom').value.trim();
    const email = document.getElementById('new-email').value.trim();
    const direction = document.getElementById('new-direction').value.trim();
    const poste = document.getElementById('new-poste').value.trim();
    const statut_contrat = document.getElementById('new-statut-contrat').value;
    const date_embauche = document.getElementById('new-date-embauche').value;
    const role = document.getElementById('new-role').value;
    const msg = document.getElementById('user-msg');
    
    if (!matricule || !password || !nom || !prenom) {
        msg.style.color = '#dc2626';
        msg.innerText = "Veuillez remplir tous les champs obligatoires (*).";
        return;
    }
    
    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                matricule, password, nom, prenom, email, poste, direction,
                statut_contrat, date_embauche, role,
                created_by: currentUser ? currentUser.id : 1
            })
        });
        const data = await res.json();
        
        if (data.success) {
            msg.style.color = '#000000';
            msg.innerText = `Utilisateur [${matricule.toUpperCase()}] créé avec succès !`;
            document.getElementById('create-user-form').reset();
            loadUsers();
            setTimeout(() => { 
                closeCreateUserModal(); 
            }, 1200);
        } else {
            msg.style.color = '#dc2626';
            msg.innerText = data.error || "Erreur lors de la création.";
        }
    } catch (e) {
        console.error("createUser error:", e);
        msg.style.color = '#dc2626';
        msg.innerText = "Erreur de communication avec le serveur.";
    }
}

// --- IMPORTATION EN MASSE D'UTILISATEURS VIA FICHIER ---

window.openBulkUserModal = function() {
    const modal = document.getElementById('bulk-user-modal');
    if (modal) modal.style.display = 'flex';
    const input = document.getElementById('bulk-user-file-input');
    if (input) input.value = '';
    const info = document.getElementById('bulk-file-info');
    if (info) info.style.display = 'none';
    const results = document.getElementById('bulk-import-results');
    if (results) results.style.display = 'none';
    const msg = document.getElementById('bulk-modal-msg');
    if (msg) msg.innerText = '';
    const submitBtn = document.getElementById('bulk-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Lancer l\'importation';
    }

    // Initialiser le drag & drop si pas encore fait
    const dropZone = document.getElementById('bulk-drop-zone');
    if (dropZone && !dropZone._dragInit) {
        dropZone._dragInit = true;
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.style.borderColor = '#000000';
                dropZone.style.background = '#f8fafc';
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.style.borderColor = '#cbd5e1';
                dropZone.style.background = '#fafafa';
            }, false);
        });
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                const fileInput = document.getElementById('bulk-user-file-input');
                if (fileInput) {
                    fileInput.files = files;
                    window.handleBulkFileSelected(fileInput);
                }
            }
        }, false);
    }
};

window.closeBulkUserModal = function() {
    const modal = document.getElementById('bulk-user-modal');
    if (modal) modal.style.display = 'none';
};

window.handleBulkFileSelected = function(input) {
    const file = input.files && input.files[0];
    const infoBox = document.getElementById('bulk-file-info');
    const msg = document.getElementById('bulk-modal-msg');
    if (msg) msg.innerText = '';
    if (file) {
        document.getElementById('bulk-file-name').innerText = file.name;
        document.getElementById('bulk-file-size').innerText = (file.size / 1024).toFixed(1) + ' KB';
        if (infoBox) infoBox.style.display = 'block';
    } else {
        if (infoBox) infoBox.style.display = 'none';
    }
};

window.uploadBulkUsers = async function() {
    const fileInput = document.getElementById('bulk-user-file-input');
    const file = fileInput.files && fileInput.files[0];
    const msg = document.getElementById('bulk-modal-msg');
    const resultsBox = document.getElementById('bulk-import-results');
    const submitBtn = document.getElementById('bulk-submit-btn');

    if (!file) {
        msg.style.color = '#dc2626';
        msg.innerText = "Veuillez sélectionner un fichier (Excel ou CSV) avant de lancer l'importation.";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Traitement en cours...';
    msg.style.color = '#e9041e';
    msg.innerText = "Analyse et importation des données...";
    if (resultsBox) resultsBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('created_by', currentUser ? currentUser.id : 1);

        const res = await fetch('/api/users/import', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (res.ok && data.success) {
            resultsBox.style.display = 'block';
            document.getElementById('stat-total').innerText = data.total || 0;
            document.getElementById('stat-success').innerText = data.created_count || 0;
            document.getElementById('stat-errors').innerText = data.error_count || 0;

            // Affichage des erreurs si présentes
            const errorsBox = document.getElementById('bulk-errors-box');
            const errorsTbody = document.getElementById('bulk-errors-tbody');
            if (data.errors && data.errors.length > 0) {
                document.getElementById('bulk-errors-count').innerText = data.errors.length;
                errorsTbody.innerHTML = data.errors.map(err => `
                    <tr style="border-bottom: 1px solid #fed7d7;">
                        <td style="padding: 6px 10px; font-weight: 700; color: #991b1b;">Ligne ${err.row}</td>
                        <td style="padding: 6px 10px; font-family: monospace; font-weight: 600;">${err.matricule || 'N/A'}</td>
                        <td style="padding: 6px 10px; color: #dc2626;">${err.error}</td>
                    </tr>
                `).join('');
                errorsBox.style.display = 'block';
            } else {
                errorsBox.style.display = 'none';
            }

            // Affichage des utilisateurs créés
            const successBox = document.getElementById('bulk-success-box');
            const successTbody = document.getElementById('bulk-success-tbody');
            if (data.created && data.created.length > 0) {
                document.getElementById('bulk-success-count').innerText = data.created.length;
                successTbody.innerHTML = data.created.map(u => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 6px 10px; font-weight: 700; color: #000000; font-family: monospace;">${u.matricule}</td>
                        <td style="padding: 6px 10px;"><strong>${u.nom}</strong> ${u.prenom}</td>
                        <td style="padding: 6px 10px; color: #475569;">${u.direction || '-'} / ${u.poste || '-'}</td>
                        <td style="padding: 6px 10px;"><span class="role-badge role-${u.role}">${u.role === 'superadmin' ? 'Super Admin' : (u.role === 'admin' ? 'Admin' : 'Apprenant')}</span></td>
                    </tr>
                `).join('');
                successBox.style.display = 'block';
            } else {
                successBox.style.display = 'none';
            }

            if (data.created_count > 0) {
                msg.style.color = '#000000';
                msg.innerText = `${data.created_count} utilisateur(s) importé(s) avec succès !`;
                loadUsers();
            } else {
                msg.style.color = '#dc2626';
                msg.innerText = `Aucun utilisateur créé. Veuillez corriger les erreurs indiquées ci-dessous.`;
            }
        } else {
            msg.style.color = '#dc2626';
            msg.innerText = data.error || "Erreur lors de l'importation du fichier.";
        }
    } catch (e) {
        console.error("uploadBulkUsers error:", e);
        msg.style.color = '#dc2626';
        msg.innerText = "Erreur de communication avec le serveur.";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Lancer l\'importation';
    }
};

function openEditUserModal(id) {
    const user = window.allUsers.find(u => u.id === id);
    if (!user) return;
    
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-matricule').value = user.matricule || '';
    document.getElementById('edit-password').value = '';
    document.getElementById('edit-nom').value = user.nom || '';
    document.getElementById('edit-prenom').value = user.prenom || '';
    document.getElementById('edit-email').value = user.email || '';
    document.getElementById('edit-direction').value = user.direction || '';
    document.getElementById('edit-poste').value = user.poste || '';
    document.getElementById('edit-statut-contrat').value = user.statut_contrat || 'CDI';
    document.getElementById('edit-date-embauche').value = user.date_embauche ? user.date_embauche.split(' ')[0] : '';
    document.getElementById('edit-role').value = user.role || 'user';
    document.getElementById('edit-user-msg').innerText = '';
    
    document.getElementById('edit-user-modal').style.display = 'flex';
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    document.getElementById('edit-user-msg').innerText = '';
}

async function saveUserEdit() {
    const id = document.getElementById('edit-user-id').value;
    const matricule = document.getElementById('edit-matricule').value.trim();
    const password = document.getElementById('edit-password').value.trim();
    const nom = document.getElementById('edit-nom').value.trim();
    const prenom = document.getElementById('edit-prenom').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const direction = document.getElementById('edit-direction').value.trim();
    const poste = document.getElementById('edit-poste').value.trim();
    const statut_contrat = document.getElementById('edit-statut-contrat').value;
    const date_embauche = document.getElementById('edit-date-embauche').value;
    const role = document.getElementById('edit-role').value;
    const msg = document.getElementById('edit-user-msg');
    
    if (!matricule || !nom || !prenom) {
        msg.style.color = '#dc2626';
        msg.innerText = "Matricule, nom et prénom sont obligatoires.";
        return;
    }
    
    try {
        const bodyData = { matricule, nom, prenom, email, poste, direction, statut_contrat, date_embauche, role };
        if (password) bodyData.password = password;
        
        const res = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(bodyData)
        });
        const data = await res.json();
        
        if (data.success) {
            if (currentUser && currentUser.id == id) {
                currentUser.matricule = matricule;
                currentUser.nom = nom;
                currentUser.prenom = prenom;
                currentUser.email = email;
                currentUser.poste = poste;
                currentUser.direction = direction;
                currentUser.statut_contrat = statut_contrat;
                currentUser.date_embauche = date_embauche;
                currentUser.role = role;
                try {
                    sessionStorage.setItem('ia_formation_user', JSON.stringify(currentUser));
                    localStorage.setItem('ia_formation_user', JSON.stringify(currentUser));
                } catch(e) {}
                applyAuthState();
            }
            
            closeEditUserModal();
            loadUsers();
        } else {
            msg.style.color = '#dc2626';
            msg.innerText = data.error || "Erreur lors de la modification.";
        }
    } catch (e) {
        console.error("saveUserEdit error:", e);
        msg.style.color = '#dc2626';
        msg.innerText = "Erreur de communication avec le serveur.";
    }
}

async function deleteUser(id, matricule) {
    if (!confirm(`Voulez-vous vraiment supprimer l'utilisateur [${matricule || id}] ?`)) return;
    try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadUsers();
        } else {
            alert(data.error || "Erreur lors de la suppression");
        }
    } catch (e) {
        console.error("deleteUser error:", e);
        alert("Erreur lors de la suppression de l'utilisateur.");
    }
}

