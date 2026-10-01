// =========================================================================
// PAGE DASHBOARD : TABLEAU DE BORD PILOTAGE, METRIQUES, TIMELINE & EXPORT
// =========================================================================

async function updateDashboard() {
    if (!currentUser) return;
    const isAdminOrSuper = currentUser.role === 'admin' || currentUser.role === 'superadmin';
    
    if (isAdminOrSuper) {
        // Chargement automatique des statistiques enrichies V2 (Sections 18-24, 33, 35)
        await loadAdminStatsV2();
        
        const totalCourses = courses.length;
        let totalHours = 0;
        const coursesPerDomain = {};
        courses.forEach(c => {
            const h = parseFloat(c.duration) || 0;
            totalHours += h;
            const domainName = (c.domain || '').trim() || 'Non défini';
            coursesPerDomain[domainName] = (coursesPerDomain[domainName] || 0) + 1;
        });
        
        let levelCounts = { 'Débutant': 0, 'Intermédiaire': 0, 'Avancé': 0 };
        courses.forEach(c => {
            if (levelCounts[c.level] !== undefined) levelCounts[c.level]++;
        });

        const kpiLevels = document.getElementById('kpi-levels');
        if (kpiLevels) {
            kpiLevels.innerHTML = `
                <li>Débutant : <span>${levelCounts['Débutant']}</span></li>
                <li>Intermédiaire : <span>${levelCounts['Intermédiaire']}</span></li>
                <li>Avancé : <span>${levelCounts['Avancé']}</span></li>
            `;
        }
        
        const ctx = document.getElementById('domainChart');
        if (ctx) {
            if (domainChartInstance) domainChartInstance.destroy();
            const labels = Object.keys(coursesPerDomain);
            const data = Object.values(coursesPerDomain);
            let showLabels = true;
            if (labels.length === 0) {
                labels.push('Aucune donnée');
                data.push(1);
                showLabels = false;
            }
            if (typeof ChartDataLabels !== 'undefined') {
                Chart.register(ChartDataLabels);
            }
            domainChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: ['#e9041e', '#000000', '#475569', '#94a3b8', '#cbd5e1', '#0f172a'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 12 } } },
                        datalabels: {
                            display: showLabels,
                            color: '#ffffff',
                            font: { weight: 'bold', size: 13 },
                            formatter: (value, context) => {
                                let sum = 0;
                                let dataArr = context.chart.data.datasets[0].data;
                                dataArr.map(d => { sum += d; });
                                return (value * 100 / sum).toFixed(0) + "%";
                            }
                        }
                    }
                }
            });
        }
    } else {
        // Mode Apprenant / User : Suivi des parcours avec règle des 10 jours ouvrés (Section 47)
        try {
            const mRes = await fetch('/api/assignments_matrix');
            const allAssignments = await mRes.json();
            const myAssignments = allAssignments.filter(a => a.user_id === currentUser.id);
            
            const totalAssigned = myAssignments.length;
            const completedList = myAssignments.filter(a => a.status === 'completed' || a.passed === 1);
            const inProgressList = myAssignments.filter(a => (a.status === 'in_progress' || a.status === 'assigned') && a.passed !== 1);
            const overdueList = myAssignments.filter(a => a.is_overdue === 1 && a.passed !== 1);
            
            // Calcul de la progression moyenne
            let sumProgress = 0;
            myAssignments.forEach(a => {
                if (a.passed === 1 || a.status === 'completed') sumProgress += 100;
                else if (a.final_score) sumProgress += Math.min(a.final_score, 100);
                else sumProgress += 0;
            });
            const avgProgress = totalAssigned > 0 ? Math.round(sumProgress / totalAssigned) : 0;
            
            // Mise à jour des 4 Cartes KPI Apprenant
            const kpiAssigned = document.getElementById('user-kpi-assigned-count');
            if (kpiAssigned) kpiAssigned.innerText = totalAssigned;
            const kpiProgress = document.getElementById('user-kpi-in-progress-count');
            if (kpiProgress) kpiProgress.innerText = inProgressList.length;
            const kpiCompleted = document.getElementById('user-kpi-completed-count');
            if (kpiCompleted) kpiCompleted.innerText = completedList.length;
            const kpiAvg = document.getElementById('user-kpi-avg-progress');
            if (kpiAvg) kpiAvg.innerText = `${avgProgress}%`;
            
            const badgeCount = document.getElementById('user-assigned-badge-count');
            if (badgeCount) badgeCount.innerText = totalAssigned;
            
            // Bannière d'alerte rouge en cas de retard sur une formation assignée
            const overdueBanner = document.getElementById('user-overdue-banner');
            if (overdueBanner) {
                overdueBanner.style.display = overdueList.length > 0 ? 'flex' : 'none';
            }
            
            const tbody = document.getElementById('user-assigned-courses-tbody');
            if (tbody) {
                if (myAssignments.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="padding: 40px 20px; text-align: center; color: #64748b;">
                                <div style="font-weight: 700; font-size: 15px; color: #0f172a;">Aucune formation assignée pour le moment.</div>
                                <div style="font-size: 12.5px; color: #64748b; margin-top: 4px;">Vous pouvez consulter les cours libres et publics dans le catalogue.</div>
                                <button onclick="navigateTo('consultation')" style="margin-top: 14px; background: #e9041e; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer;">Explorer le catalogue →</button>
                            </td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML = myAssignments.map(assign => {
                        const isOverdue = (assign.is_overdue === 1 && !assign.passed);
                        const isCompleted = Boolean(assign.passed || assign.status === 'completed');
                        
                        let dueDateDisplay = 'Échéance : Aucune';
                        if (assign.due_date) {
                            try {
                                const dt = new Date(assign.due_date);
                                dueDateDisplay = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            } catch (e) {
                                dueDateDisplay = assign.due_date.split(' ')[0];
                            }
                        }
                        
                        let statusBadge = `<span style="background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 700;">À démarrer</span>`;
                        if (isOverdue) {
                            statusBadge = `<span style="background: #fee2e2; color: #dc2626; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 800; border: 1px solid #fca5a5;">En retard</span>`;
                        } else if (isCompleted) {
                            statusBadge = `<span style="background: #000000; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 800;">Validé (${Math.round(assign.final_score || assign.qcm_score || 0)}%)</span>`;
                        } else if (assign.status === 'in_progress') {
                            statusBadge = `<span style="background: #f1f5f9; color: #000000; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 700;">En cours</span>`;
                        }
                        
                        const pctProgress = isCompleted ? 100 : (assign.status === 'in_progress' ? 50 : 0);
                        
                        return `
                        <tr style="border-bottom: 1px solid #f1f5f9; ${isOverdue ? 'background: #fff8f8;' : ''}">
                            <td style="padding: 12px 16px;">
                                <div style="width: 44px; height: 32px; background: #0f172a; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: white; font-weight: 700;">SGCI</div>
                            </td>
                            <td style="padding: 12px 16px;">
                                <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${assign.course_title}</div>
                                <div style="color: #64748b; font-size: 12px;">${assign.course_domain || 'Général'} • ${assign.course_duration || 1} h</div>
                            </td>
                            <td style="padding: 12px 16px;">
                                <span style="font-size: 12.5px; font-weight: ${isOverdue ? '800' : '600'}; color: ${isOverdue ? '#dc2626' : '#334155'};">
                                    ${dueDateDisplay}
                                </span>
                            </td>
                            <td style="padding: 12px 16px;">${statusBadge}</td>
                            <td style="padding: 12px 16px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                                        <div style="width: ${pctProgress}%; height: 100%; background: ${isCompleted ? '#000000' : (isOverdue ? '#e9041e' : '#e9041e')};"></div>
                                    </div>
                                    <span style="font-size: 11.5px; font-weight: 700; color: #475569;">${pctProgress}%</span>
                                </div>
                            </td>
                            <td style="padding: 12px 16px; text-align: right;">
                                <button onclick="viewCourse(${assign.course_id})" style="background: ${isCompleted ? '#0f172a' : '#e9041e'}; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
                                    ${isCompleted ? 'Revoir' : (pctProgress > 0 ? 'Reprendre' : 'Suivre')}
                                </button>
                            </td>
                        </tr>
                        `;
                    }).join('');
                }
            }
        } catch (e) {
            console.error("Erreur calcul assignations apprenant:", e);
        }
    }
}

window.loadAdminStatsV2 = async function() {
    try {
        const res = await fetch('/api/admin/stats_v2');
        const data = await res.json();
        if (!data.success) return;
        const stats = data.stats || data;
        
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        
        let totalC = stats.total_courses;
        if (totalC === undefined || totalC === null || totalC === 0) {
            totalC = (courses && courses.length) ? courses.length : 0;
        }
        setTxt('kpi-total', totalC);
        setTxt('kpi-assignees', stats.assigned_courses || 0);
        setTxt('kpi-retard', stats.overdue_courses || 0);
        setTxt('kpi-completion-rate', `${stats.completion_rate || 0}%`);
        
        let totalH = stats.total_hours;
        if (totalH === undefined || totalH === null || totalH === 0) {
            totalH = courses.reduce((sum, c) => sum + (parseFloat(c.duration) || 0), 0);
        }
        setTxt('kpi-hours', `${parseFloat(totalH).toFixed(1)} h`);
        setTxt('kpi-avg-score', `${stats.avg_score || 0}%`);
        setTxt('admin-badge-live-count', stats.live_connected_count || (stats.live_users ? stats.live_users.length : 0));
        setTxt('admin-badge-overdue-count', stats.overdue_courses || 0);
        
        // Indicateurs téléchargements
        const dlSum = stats.downloads_summary || (typeof stats.downloads_stats === 'object' && !Array.isArray(stats.downloads_stats) ? stats.downloads_stats : {});
        setTxt('dl-kpi-total', dlSum.total || 0);
        setTxt('dl-kpi-today', dlSum.today || 0);
        setTxt('dl-kpi-week', dlSum.week || 0);
        setTxt('dl-kpi-month', dlSum.month || 0);
        
        // Tab 2: Connectés en direct (Charte SGCI : Rouge / Noir / Blanc)
        const liveTbody = document.getElementById('live-users-tbody');
        const liveUsers = stats.live_users || [];
        const livePill = document.getElementById('live-users-pill');
        if (livePill) {
            livePill.innerHTML = `● ${liveUsers.length} session(s) active(s)`;
            livePill.style.background = liveUsers.length > 0 ? '#fee2e2' : '#f1f5f9';
            livePill.style.color = liveUsers.length > 0 ? '#e9041e' : '#64748b';
            livePill.style.borderColor = liveUsers.length > 0 ? '#fca5a5' : '#cbd5e1';
        }
        if (liveTbody) {
            if (liveUsers.length === 0) {
                liveTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">Aucun collaborateur connecté en direct pour le moment.</td></tr>';
            } else {
                liveTbody.innerHTML = liveUsers.map(u => `
                    <tr>
                        <td style="font-family: monospace; font-weight: 700; color: #000000;">${u.matricule}</td>
                        <td style="font-weight: 700; color: #000000;">${u.nom} ${u.prenom}</td>
                        <td>${u.direction || '-'}</td>
                        <td>${u.poste || '-'}</td>
                        <td>${u.active_course_title || 'Session active'}</td>
                        <td><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e9041e; margin-right: 6px;"></span><strong style="color: #000000;">En direct</strong></td>
                        <td style="font-size: 12px; color: #64748b;">${u.last_ping ? u.last_ping.split(' ')[1] : '-'}</td>
                    </tr>
                `).join('');
            }
        }
        
        // Tab 3: Activité par formation
        window.adminCoursesActivityData = stats.courses_activity || [];
        if (typeof window.renderCourseActivityRows === 'function') {
            window.renderCourseActivityRows(window.adminCoursesActivityData);
        } else {
            const coursesTbody = document.getElementById('courses-activity-tbody');
            if (coursesTbody) {
                const cList = window.adminCoursesActivityData;
                if (cList.length === 0) {
                    coursesTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 20px;">Aucune formation créée.</td></tr>';
                } else {
                    coursesTbody.innerHTML = cList.map(c => `
                        <tr>
                            <td style="font-weight: 700; color: #000000;">${c.title}</td>
                            <td>${c.domain || 'Général'}</td>
                            <td><span style="background: #000000; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${c.visibility || 'Publique'}</span></td>
                            <td style="text-align: center; font-weight: 700;">${c.inscrits || 0}</td>
                            <td style="text-align: center;">${c.actifs || 0}</td>
                            <td style="text-align: center;"><span style="color: ${c.connectes > 0 ? '#e9041e' : '#64748b'}; font-weight: 700;">${c.connectes || 0}</span></td>
                            <td style="text-align: center; font-weight: 700;">${c.progression_moyenne !== null && c.progression_moyenne !== undefined ? c.progression_moyenne + '%' : '0%'}</td>
                            <td style="text-align: center; font-weight: 700; color: #000000;">${c.taux_completion || 0}%</td>
                            <td style="text-align: center; color: #64748b;">${c.taux_abandon || 0}%</td>
                        </tr>
                    `).join('');
                }
            }
        }
        
        // Tab 4: Téléchargements — render into dl-by-course-list & dl-by-user-list divs
        const dlCourseList = document.getElementById('dl-by-course-list');
        const dlUserList = document.getElementById('dl-by-user-list');
        const dlList = stats.downloads_list || (Array.isArray(stats.downloads_stats) ? stats.downloads_stats : []);
        
        if (dlCourseList) {
            if (dlList.length === 0) {
                dlCourseList.innerHTML = '<p style="color: #64748b; font-size: 13px; margin: 0;">Aucun téléchargement enregistré.</p>';
            } else {
                const byCourse = {};
                dlList.forEach(d => {
                    const key = d.course_title || 'Inconnu';
                    if (!byCourse[key]) byCourse[key] = { total: 0, types: [] };
                    byCourse[key].total += (d.total_downloads || 0);
                    byCourse[key].types.push(d.doc_type);
                });
                dlCourseList.innerHTML = Object.entries(byCourse).map(([title, info]) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div>
                            <div style="font-weight: 700; color: #000000; font-size: 13.5px;">${title}</div>
                            <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">${info.types.join(', ')}</div>
                        </div>
                        <span style="font-weight: 800; color: #e9041e; font-size: 16px;">${info.total}</span>
                    </div>
                `).join('');
            }
        }
        
        if (dlUserList) {
            const dlByUser = stats.downloads_by_user || [];
            if (dlByUser.length === 0) {
                dlUserList.innerHTML = '<p style="color: #64748b; font-size: 13px; margin: 0;">Aucun collaborateur n\'a téléchargé de documents.</p>';
            } else {
                dlUserList.innerHTML = dlByUser.map(u => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div>
                            <div style="font-weight: 700; color: #000000; font-size: 13.5px;">${u.nom || ''} ${u.prenom || ''}</div>
                            <div style="font-size: 11.5px; color: #64748b;">${u.matricule || '-'}</div>
                        </div>
                        <span style="font-weight: 800; color: #000000; font-size: 16px;">${u.total_downloads || 0}</span>
                    </div>
                `).join('');
            }
        }
        
        // Tab 6: Retards
        const overdueTbody = document.getElementById('admin-overdue-tbody');
        if (overdueTbody) {
            const overdueList = stats.overdue_list || [];
            if (overdueList.length === 0) {
                overdueTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #000000; font-weight: 700; padding: 20px;">Aucun retard constaté. Toutes les échéances sont respectées.</td></tr>';
            } else {
                overdueTbody.innerHTML = overdueList.map(o => `
                    <tr style="background: #fff5f5;">
                        <td style="font-family: monospace; font-weight: 800; color: #e9041e;">${o.matricule}</td>
                        <td style="font-weight: 700; color: #000000;">${o.nom} ${o.prenom}</td>
                        <td>${o.direction || '-'} / ${o.poste || '-'}</td>
                        <td style="font-weight: 600;">${o.course_title}</td>
                        <td style="font-size: 12px; color: #64748b;">${o.assigned_at ? o.assigned_at.split(' ')[0] : '-'}</td>
                        <td style="font-size: 12px; font-weight: 700; color: #e9041e;">${o.due_date ? o.due_date.split(' ')[0] : '-'}</td>
                        <td style="font-weight: 800; color: #e9041e;">+${o.delay_days || 1} j</td>
                        <td style="text-align: center;"><button onclick="openCourseDetails(${o.course_id})" class="action-btn-sm" style="background: #e9041e; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: none; cursor: pointer;">Voir cours</button></td>
                    </tr>
                `).join('');
            }
        }
    } catch (e) {
        console.error("loadAdminStatsV2 error:", e);
    }
};

window.renderCourseActivityRows = function(list) {
    const coursesTbody = document.getElementById('courses-activity-tbody');
    if (!coursesTbody) return;
    if (!list || list.length === 0) {
        coursesTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 20px;">Aucune formation trouvée.</td></tr>';
        return;
    }
    coursesTbody.innerHTML = list.map(c => `
        <tr>
            <td style="font-weight: 700; color: #000000;">${c.title}</td>
            <td>${c.domain || 'Général'}</td>
            <td><span style="background: #000000; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${c.visibility || 'Publique'}</span></td>
            <td style="text-align: center; font-weight: 700;">${c.inscrits || 0}</td>
            <td style="text-align: center;">${c.actifs || 0}</td>
            <td style="text-align: center;"><span style="color: ${c.connectes > 0 ? '#e9041e' : '#64748b'}; font-weight: 700;">${c.connectes || 0}</span></td>
            <td style="text-align: center; font-weight: 700;">${c.progression_moyenne !== null && c.progression_moyenne !== undefined ? c.progression_moyenne + '%' : '0%'}</td>
            <td style="text-align: center; font-weight: 700; color: #000000;">${c.taux_completion || 0}%</td>
            <td style="text-align: center; color: #64748b;">${c.taux_abandon || 0}%</td>
        </tr>
    `).join('');
};

window.filterCourseActivityTable = function() {
    const q = (document.getElementById('filter-course-activity-input')?.value || '').toLowerCase().trim();
    if (!window.adminCoursesActivityData) return;
    const filtered = window.adminCoursesActivityData.filter(c => 
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.domain && c.domain.toLowerCase().includes(q))
    );
    window.renderCourseActivityRows(filtered);
};

window.switchAdminDashboardTab = function(tabKey) {
    const tabs = ['overview', 'live', 'courses', 'downloads', 'individual', 'overdue'];
    tabs.forEach(t => {
        const btn = document.getElementById(`admin-tab-btn-${t}`);
        const sec = document.getElementById(`admin-sec-${t}`);
        if (btn) btn.classList.toggle('active', t === tabKey);
        if (sec) sec.style.display = (t === tabKey) ? 'block' : 'none';
    });
};

window.exportPilotageCSV = function() {
    window.location.href = '/api/admin/export_pilotage';
};

window.searchUserForTimeline = async function() {
    const q = (document.getElementById('admin-timeline-search')?.value || '').trim();
    const container = document.getElementById('admin-timeline-container');
    const ficheBox = document.getElementById('admin-user-fiche-box');
    if (!q) {
        alert("Veuillez saisir un nom, matricule ou email d'utilisateur.");
        return;
    }
    if (container) container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">Recherche de l\'historique pédagogique...</div>';
    
    try {
        const uRes = await fetch('/api/users');
        const uList = await uRes.json();
        const qLower = q.toLowerCase();
        const user = uList.find(u => 
            (u.matricule && u.matricule.toLowerCase() === qLower) ||
            (u.nom && u.nom.toLowerCase().includes(qLower)) ||
            (u.prenom && u.prenom.toLowerCase().includes(qLower)) ||
            (u.email && u.email.toLowerCase().includes(qLower))
        );
        if (!user) {
            if (ficheBox) ficheBox.style.display = 'none';
            if (container) container.innerHTML = `<div style="text-align: center; padding: 30px; color: #e9041e; font-weight: 700;">Aucun collaborateur trouvé pour "${q}".</div>`;
            return;
        }
        
        // Afficher la fiche utilisateur
        if (ficheBox) {
            ficheBox.style.display = 'block';
            const ficheNameEl = document.getElementById('fiche-user-name');
            const ficheMetaEl = document.getElementById('fiche-user-meta');
            const ficheBadgeEl = document.getElementById('fiche-user-badge');
            if (ficheNameEl) ficheNameEl.textContent = `${user.nom || ''} ${user.prenom || ''}`.trim();
            if (ficheMetaEl) ficheMetaEl.textContent = `${user.matricule || '-'} • ${user.direction || '-'} • ${user.poste || '-'} • ${user.email || '-'}`;
            if (ficheBadgeEl) {
                ficheBadgeEl.textContent = user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Administrateur' : 'Collaborateur';
                ficheBadgeEl.className = `role-badge role-${user.role || 'user'}`;
            }
        }
        
        const tRes = await fetch(`/api/admin/user_timeline/${user.id}`);
        const tData = await tRes.json();
        const timeline = tData.timeline || [];
        if (timeline.length === 0) {
            if (container) container.innerHTML = `<div style="text-align: center; padding: 30px; color: #64748b;">Aucune activité enregistrée pour ${user.nom || ''} ${user.prenom || ''}.</div>`;
            return;
        }
        
        container.innerHTML = `
            <div class="timeline-list" style="position: relative; padding-left: 24px; border-left: 2px solid #e2e8f0;">
                ${timeline.map(ev => `
                    <div style="position: relative; margin-bottom: 20px;">
                        <div style="position: absolute; left: -31px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #e9041e; border: 2px solid white;"></div>
                        <div style="font-size: 11.5px; color: #64748b;">${ev.date ? ev.date.replace('T', ' ').substring(0, 19) : ''}</div>
                        <div style="font-size: 14px; font-weight: 800; color: #000000; margin-top: 2px;">${ev.title || ev.action || ''}</div>
                        <div style="font-size: 13px; color: #475569; margin-top: 2px;">${ev.description || ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error("searchUserForTimeline error:", e);
        if (container) container.innerHTML = '<div style="color: #e9041e; padding: 20px; font-weight: 700;">Erreur lors de la récupération de la timeline.</div>';
    }
};

function getAdminDashboardSummaryJson() {
    const totalCourses = courses ? courses.length : 0;
    let totalHours = 0;
    let domainCounts = {};
    let levelCounts = {
        'Débutant': 0,
        'Intermédiaire': 0,
        'Avancé': 0
    };

    const coursesSummary = (courses || []).map(c => {
        const d = Number(c.duration) || 0;
        totalHours += d;
        const dom = c.domain || 'Général';
        domainCounts[dom] = (domainCounts[dom] || 0) + 1;
        const lvl = c.level || 'Débutant';
        if (levelCounts[lvl] !== undefined) {
            levelCounts[lvl]++;
        } else {
            levelCounts[lvl] = 1;
        }
        return {
            id: c.id,
            titre: c.title || 'Sans titre',
            domaine: dom,
            duree_heures: d,
            niveau: lvl,
            visibilite: c.visibility || 'public'
        };
    });

    const nomComplet = currentUser ? (`${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.matricule || 'Admin') : 'Admin';
    const roleName = currentUser ? (currentUser.role === 'superadmin' ? 'Super Admin' : (currentUser.role === 'admin' ? 'Administrateur' : 'Apprenant')) : 'Super Admin';

    return {
        application: "IA Formation",
        utilisateur_connecte: {
            nom_complet: nomComplet,
            matricule: currentUser ? (currentUser.matricule || 'ADMIN001') : 'ADMIN001',
            role: roleName,
            direction: currentUser ? (currentUser.direction || '') : '',
            poste: currentUser ? (currentUser.poste || '') : ''
        },
        ecran_actif: "Tableau de Bord Administrateur",
        kpis_principaux: {
            total_formations: totalCourses,
            volume_horaire_total_heures: totalHours,
            domaines_differents_count: Object.keys(domainCounts).length
        },
        repartition_par_niveau: levelCounts,
        formations_par_domaine: domainCounts,
        catalogue_formations_detail: coursesSummary
    };
}

let pdfDoc = null;
let pageNum = 1;
let currentCourse = null;
let selectedCourseForModal = null;

// Modal de Choix du Mode d'Apprentissage
