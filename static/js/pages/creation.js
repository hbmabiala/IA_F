// =========================================================================
// PAGE CREATION : FORMULAIRE DE CREATION DE FORMATION & TRAITEMENT IA
// =========================================================================

function openNewCourseForm() {
    try {
        sessionStorage.removeItem('ia_formation_edit_course_id');
        localStorage.removeItem('ia_formation_edit_course_id');
    } catch(e) {}

    const creationPage = document.getElementById('page-creation');
    if (!creationPage) {
        window.location.href = '/creation';
        return;
    }

    const heading = document.getElementById('creation-form-heading');
    if (heading) heading.innerText = 'Création de Formation';

    const form = document.getElementById('course-form');
    if (form) form.reset();

    const idEl = document.getElementById('course-id');
    if (idEl) idEl.value = '';

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = 'Enregistrer la formation';

    const fileInput = document.getElementById('course-file');
    if (fileInput) {
        fileInput.required = true;
        fileInput.value = '';
    }

    const visSelect = document.getElementById('course-visibility');
    if (visSelect) visSelect.value = 'assigned';

    toggleCourseVisibilityFields();
    removeCourseThumbnail();
}
window.openNewCourseForm = openNewCourseForm;

// --- GESTION DES MINIATURES ---

function previewCourseThumbnail(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewBox = document.getElementById('course-thumbnail-preview-box');
        const previewImg = document.getElementById('course-thumbnail-preview-img');
        if (previewBox && previewImg) {
            previewImg.src = e.target.result;
            previewBox.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}
window.previewCourseThumbnail = previewCourseThumbnail;

function removeCourseThumbnail() {
    const fileInput = document.getElementById('course-thumbnail');
    if (fileInput) fileInput.value = '';
    const existingInput = document.getElementById('course-existing-thumbnail');
    if (existingInput) existingInput.value = '';
    const previewBox = document.getElementById('course-thumbnail-preview-box');
    const previewImg = document.getElementById('course-thumbnail-preview-img');
    if (previewImg) previewImg.src = '';
    if (previewBox) previewBox.style.display = 'none';
}
window.removeCourseThumbnail = removeCourseThumbnail;

// --- VISIBILITE & CIBLAGE DES FORMATIONS ---

function toggleCourseVisibilityFields() {
    const vis = document.getElementById('course-visibility')?.value;
    const targetedBox = document.getElementById('course-targeted-box');
    if (targetedBox) {
        targetedBox.style.display = (vis === 'targeted') ? 'block' : 'none';
    }
}
window.toggleCourseVisibilityFields = toggleCourseVisibilityFields;


// --- SOUMISSION DU FORMULAIRE DE CREATION DE FORMATION ---
// --- LOGIQUE GESTION DES FORMATIONS & CATALOGUE ---

document.getElementById('course-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('course-id').value;
    const title = (document.getElementById('course-title').value || '').trim();
    const desc = (document.getElementById('course-desc').value || '').trim();
    const domain = (document.getElementById('course-domain').value || '').trim() || 'Général';
    const duration = document.getElementById('course-duration').value || '1';
    const level = document.getElementById('course-level').value;
    const visibility = document.getElementById('course-visibility')?.value || 'assigned';
    const target_directions = document.getElementById('course-target-directions')?.value.trim() || '';
    const target_postes = document.getElementById('course-target-postes')?.value.trim() || '';
    const fileInput = document.getElementById('course-file');
    const thumbInput = document.getElementById('course-thumbnail');
    const existingThumbnail = document.getElementById('course-existing-thumbnail')?.value || '';
    
    if (!id && (!fileInput.files || fileInput.files.length === 0)) {
        alert("Veuillez sélectionner un Document source (*)");
        fileInput.focus();
        return;
    }
    
    if (!title) {
        alert("Veuillez saisir le Titre de la formation (*)");
        document.getElementById('course-title').focus();
        return;
    }
    
    if (!desc) {
        alert("Veuillez saisir la Description & Consignes pour l'IA (*)");
        document.getElementById('course-desc').focus();
        return;
    }
    
async function pollTaskStatus(taskId) {
    const textEl = document.getElementById('loading-overlay-text');
    const subtextEl = document.getElementById('loading-overlay-subtext');
    const barEl = document.getElementById('loading-overlay-bar');

    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        let res;
        try {
            res = await fetch('/api/task_status/' + taskId);
        } catch (netErr) {
            console.warn("Petit problème réseau lors du suivi, nouvelle tentative dans 2s...", netErr);
            continue;
        }
        
        let data;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const rawText = await res.text();
            throw new Error("Réponse serveur inattendue (" + res.status + ") : " + rawText.substring(0, 120));
        }

        if (!res.ok) {
            throw new Error(data.error || "Erreur lors du suivi de la génération");
        }

        if (data.status === 'processing') {
            const pct = data.progress || 10;
            if (barEl) barEl.style.width = pct + '%';
            if (subtextEl) subtextEl.innerText = (data.step || 'Traitement par l\'IA en cours...') + ` (${pct}%)`;
        } else if (data.status === 'completed') {
            if (barEl) barEl.style.width = '100%';
            if (subtextEl) subtextEl.innerText = 'Génération terminée avec succès ! (100%)';
            return data.result;
        } else if (data.status === 'error') {
            throw new Error(data.error || "La création de la formation a échoué.");
        }
    }
}

    // Afficher l'écran de chargement
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
    const barEl = document.getElementById('loading-overlay-bar');
    const subtextEl = document.getElementById('loading-overlay-subtext');
    if (barEl) barEl.style.width = '5%';
    if (subtextEl) subtextEl.innerText = 'Téléversement du fichier source vers le serveur...';
    
    try {
        const tutorVoice = (document.getElementById('course-tutor-voice')?.value || 'auto').trim();
        
        if (!id) {
            // Création : envoi au backend Python
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('title', title);
            formData.append('desc', desc);
            formData.append('domain', domain);
            formData.append('duration', duration);
            formData.append('level', level);
            formData.append('visibility', visibility);
            formData.append('target_directions', target_directions);
            formData.append('target_postes', target_postes);
            formData.append('thumbnail_url', existingThumbnail);
            formData.append('tutor_voice', tutorVoice);
            
            if (thumbInput && thumbInput.files.length > 0) {
                formData.append('thumbnail', thumbInput.files[0]);
            }
            
            const apiKey = window.config ? window.config.GEMINI_API_KEY : '';
            formData.append('api_key', apiKey);
            
            const response = await fetch('/api/create_course', {
                method: 'POST',
                body: formData
            });
            
            let result;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const rawText = await response.text();
                throw new Error("Réponse non-JSON reçue (" + response.status + ") : " + rawText.substring(0, 150));
            }

            if (!response.ok && response.status !== 202) {
                throw new Error(result.error || "Erreur lors de l'initialisation de la création");
            }

            if (result.task_id) {
                // Suivi asynchrone de la progression
                await pollTaskStatus(result.task_id);
            }
        } else {
            // Modification : si une nouvelle miniature est fournie ou formulaire standard
            if (thumbInput && thumbInput.files.length > 0) {
                const formData = new FormData();
                formData.append('title', title);
                formData.append('desc', desc);
                formData.append('domain', domain);
                formData.append('duration', duration);
                formData.append('level', level);
                formData.append('visibility', visibility);
                formData.append('target_directions', target_directions);
                formData.append('target_postes', target_postes);
                formData.append('thumbnail', thumbInput.files[0]);
                formData.append('thumbnail_url', existingThumbnail);
                formData.append('tutor_voice', tutorVoice);
                
                const response = await fetch('/api/courses/' + id, {
                    method: 'PUT',
                    body: formData
                });
                if (!response.ok) {
                    throw new Error("Erreur lors de la modification");
                }
            } else {
                const response = await fetch('/api/courses/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        title, desc, domain, duration, level,
                        visibility, target_directions, target_postes,
                        thumbnail_url: existingThumbnail,
                        tutor_voice: tutorVoice
                    })
                });
                if (!response.ok) {
                    throw new Error("Erreur lors de la modification");
                }
            }
        }
        
        // Rafraîchir la liste depuis SQLite
        await loadCourses();
        
        // Vider le formulaire
        this.reset();
        document.getElementById('course-id').value = '';
        if (document.getElementById('course-tutor-voice')) {
            document.getElementById('course-tutor-voice').value = 'auto';
        }
        document.getElementById('submit-btn').innerText = 'Enregistrer la formation';
        toggleCourseVisibilityFields();
        removeCourseThumbnail();
        
        // Mettre à jour l'affichage du catalogue
        renderCatalog();
        
        // Cacher chargement
        if (overlay) overlay.style.display = 'none';
        
        // Retourner au catalogue
        try {
            sessionStorage.removeItem('ia_formation_edit_course_id');
            localStorage.removeItem('ia_formation_edit_course_id');
        } catch(e) {}
        window.location.href = '/catalogue';
        
    } catch (err) {
        console.error(err);
        alert("Erreur: " + err.message);
        if (overlay) overlay.style.display = 'none';
    }
});


// --- GESTION DE LA MODIFICATION D'UNE FORMATION EXISTANTE ---
function populateCourseFormForEdit(id) {
    const creationPage = document.getElementById('page-creation');
    if (!creationPage) {
        try {
            sessionStorage.setItem('ia_formation_edit_course_id', id);
            localStorage.setItem('ia_formation_edit_course_id', id);
        } catch(e) {}
        window.location.href = '/creation?edit_course_id=' + id;
        return;
    }

    let course = (courses && courses.length > 0) ? courses.find(c => c.id == id) : null;
    if (!course) {
        fetch('/api/courses')
            .then(r => r.json())
            .then(data => {
                courses = data;
                const found = courses.find(c => c.id == id);
                if (found) populateCourseFormForEdit(id);
            })
            .catch(err => console.warn("Fallback load courses failed:", err));
        return;
    }

    const heading = document.getElementById('creation-form-heading');
    if (heading) heading.innerText = `Modifier la formation : ${course.title || ''}`;

    const idEl = document.getElementById('course-id');
    if (idEl) idEl.value = course.id;

    const titleEl = document.getElementById('course-title');
    if (titleEl) titleEl.value = course.title || '';

    const descEl = document.getElementById('course-desc');
    if (descEl) descEl.value = course.desc || '';

    const domainEl = document.getElementById('course-domain');
    if (domainEl) domainEl.value = course.domain || '';

    const durationEl = document.getElementById('course-duration');
    if (durationEl) durationEl.value = course.duration || '';

    const levelEl = document.getElementById('course-level');
    if (levelEl) levelEl.value = course.level || 'Débutant';

    const voiceSelect = document.getElementById('course-tutor-voice');
    if (voiceSelect) voiceSelect.value = course.tutor_voice || 'auto';

    const fileInput = document.getElementById('course-file');
    if (fileInput) {
        fileInput.required = false;
        fileInput.value = '';
    }

    const visSelect = document.getElementById('course-visibility');
    if (visSelect) visSelect.value = course.visibility || 'assigned';

    const dirInput = document.getElementById('course-target-directions');
    if (dirInput) dirInput.value = course.target_directions || '';

    const postInput = document.getElementById('course-target-postes');
    if (postInput) postInput.value = course.target_postes || '';

    const existingThumbInput = document.getElementById('course-existing-thumbnail');
    const previewBox = document.getElementById('course-thumbnail-preview-box');
    const previewImg = document.getElementById('course-thumbnail-preview-img');
    const thumbInput = document.getElementById('course-thumbnail');
    if (thumbInput) thumbInput.value = '';

    if (course.thumbnail_url) {
        if (existingThumbInput) existingThumbInput.value = course.thumbnail_url;
        if (previewImg) previewImg.src = course.thumbnail_url;
        if (previewBox) previewBox.style.display = 'block';
    } else {
        removeCourseThumbnail();
    }

    toggleCourseVisibilityFields();

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = 'Mettre à jour la formation';
}
window.populateCourseFormForEdit = populateCourseFormForEdit;

window.initCreationPage = function() {
    if (!document.getElementById('page-creation')) return;
    const urlParams = new URLSearchParams(window.location.search);
    let editId = urlParams.get('edit_course_id') || urlParams.get('course_id');
    if (!editId) {
        try {
            editId = sessionStorage.getItem('ia_formation_edit_course_id') || localStorage.getItem('ia_formation_edit_course_id');
        } catch(e) {}
    }

    if (editId) {
        populateCourseFormForEdit(editId);
    } else {
        openNewCourseForm();
    }
};

window.editCourse = function(id) {
    try {
        sessionStorage.setItem('ia_formation_edit_course_id', id);
        localStorage.setItem('ia_formation_edit_course_id', id);
    } catch(e) {}

    const creationPage = document.getElementById('page-creation');
    if (!creationPage) {
        window.location.href = '/creation?edit_course_id=' + id;
        return;
    }

    populateCourseFormForEdit(id);
};

