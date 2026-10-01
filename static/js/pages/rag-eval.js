// =========================================================================
// PAGE RAG EVALUATION : AUDIT, BENCHMARK RAG & METRIQUES (SUPER ADMIN)
// =========================================================================

// ==============================================================================
// MODULE D'EVALUATION & BENCHMARK RAG (CHROMA DB + GEMINI) - EXCLUSIF SUPER ADMIN
// ==============================================================================

function escapeRagHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.ragEvaluationData = {
    courses: [],
    report: null,
    isLoading: false
};

window.setRagEvalMode = function(mode) {
    const radio = document.querySelector(`input[name="rag-eval-mode"][value="${mode}"]`);
    if (radio) {
        radio.checked = true;
    }
    const btnBench = document.getElementById('seg-btn-benchmark');
    const btnSingle = document.getElementById('seg-btn-single');
    if (btnBench) btnBench.classList.toggle('active', mode === 'benchmark');
    if (btnSingle) btnSingle.classList.toggle('active', mode === 'single');
    toggleRagModeFields();
};

window.toggleRagModeFields = function() {
    const isSingle = document.querySelector('input[name="rag-eval-mode"][value="single"]')?.checked;
    const queryGroup = document.getElementById('rag-custom-query-group');
    const queryInput = document.getElementById('rag-custom-query');
    const btnLabel = document.getElementById('btn-run-rag-label');
    const btnBench = document.getElementById('seg-btn-benchmark');
    const btnSingle = document.getElementById('seg-btn-single');

    if (btnBench) btnBench.classList.toggle('active', !isSingle);
    if (btnSingle) btnSingle.classList.toggle('active', isSingle);
    
    if (queryGroup) {
        queryGroup.style.display = isSingle ? 'block' : 'none';
    }
    if (queryInput) {
        queryInput.required = isSingle;
        if (isSingle) queryInput.focus();
    }
    if (btnLabel) {
        btnLabel.innerText = isSingle ? "Tester la Requête en Direct" : "Lancer le Benchmark Complet";
    }
};

window.loadRagEvaluationData = async function(forceRefresh = false) {
    if (!currentUser || currentUser.role !== 'superadmin') return;

    const lastRunBadge = document.getElementById('rag-last-timestamp');
    if (lastRunBadge && forceRefresh) lastRunBadge.innerText = 'Actualisation...';

    try {
        const res = await fetch('/api/admin/rag_evaluation', {
            headers: { 'X-User-Id': currentUser.id }
        });
        if (!res.ok) {
            throw new Error(`Erreur serveur (${res.status})`);
        }
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Erreur lors du chargement des données RAG');
        }

        window.ragEvaluationData.courses = data.courses || [];
        window.ragEvaluationData.report = data.latest_report || null;

        // Mise à jour du sélecteur de cours
        const selectCourse = document.getElementById('rag-select-course');
        if (selectCourse) {
            const currentSelected = selectCourse.value;
            selectCourse.innerHTML = '<option value="">-- Sélectionner une formation indexée --</option>';
            window.ragEvaluationData.courses.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.base_id || '';
                const benchTag = c.has_benchmark ? ' [Benchmark disponible]' : '';
                opt.textContent = `[#${c.id}] ${c.title} (${c.chunks_count} chunks indexés)${benchTag}`;
                selectCourse.appendChild(opt);
            });

            // Présélectionner le cours du rapport ou le premier cours disponible
            if (currentSelected) {
                selectCourse.value = currentSelected;
            } else if (data.latest_report && data.latest_report.base_id) {
                selectCourse.value = data.latest_report.base_id;
            } else if (selectCourse.options.length > 1) {
                selectCourse.selectedIndex = 1;
            }
        }

        // Rendu du tableau de bord
        window.renderRagEvaluationDashboard(window.ragEvaluationData.report, window.ragEvaluationData.courses);

    } catch (e) {
        console.error("Erreur loadRagEvaluationData:", e);
        const tbody = document.getElementById('rag-eval-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 25px;">Erreur de chargement : ${e.message}</td></tr>`;
        }
    }
};

window.renderRagEvaluationDashboard = function(report, courses) {
    const timestampEl = document.getElementById('rag-last-timestamp');
    const kpiGlobal = document.getElementById('rag-kpi-global');
    const kpiStatus = document.getElementById('rag-kpi-global-status');
    const kpiContext = document.getElementById('rag-kpi-context');
    const kpiGrounded = document.getElementById('rag-kpi-grounded');
    const kpiAnswer = document.getElementById('rag-kpi-answer');
    const kpiLatency = document.getElementById('rag-kpi-latency');
    const kpiRetrieval = document.getElementById('rag-kpi-retrieval');
    const diagCourse = document.getElementById('rag-diagnostics-course-label');
    const diagContent = document.getElementById('rag-diagnostics-content');
    const testsCountEl = document.getElementById('rag-tests-count');
    const tbody = document.getElementById('rag-eval-tbody');

    if (!report || !report.averages) {
        if (timestampEl) timestampEl.innerText = "Aucun rapport exécuté";
        if (kpiGlobal) kpiGlobal.innerText = "--";
        if (kpiStatus) { kpiStatus.innerText = "Non évalué"; kpiStatus.style.color = "#64748b"; }
        if (kpiContext) kpiContext.innerText = "--";
        if (kpiGrounded) kpiGrounded.innerText = "--";
        if (kpiAnswer) kpiAnswer.innerText = "--";
        if (kpiLatency) kpiLatency.innerText = "-- ms";
        if (kpiRetrieval) kpiRetrieval.innerText = "ChromaDB: -- ms";
        if (diagCourse) diagCourse.innerText = "Non renseigné";
        if (diagContent) {
            diagContent.innerHTML = `<p style="margin: 0; color: #64748b;">Aucune donnée d'évaluation disponible. Cliquez sur <strong>« Lancer l'Évaluation du RAG »</strong> ci-dessus pour démarrer.</p>`;
        }
        if (testsCountEl) testsCountEl.innerText = "0";
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 30px;">Aucun test RAG enregistré. Cliquez sur « Lancer l'Évaluation » ci-dessus.</td></tr>`;
        }
        return;
    }

    const avgs = report.averages || {};
    const globalScore = avgs.global_rag_score || 0;
    const cRel = avgs.context_relevance || 0;
    const ground = avgs.groundedness || 0;
    const aRel = avgs.answer_relevance || 0;
    const totLat = avgs.total_latency_ms || 0;
    const retLat = avgs.retrieval_latency_ms || 0;

    // Date
    if (timestampEl) timestampEl.innerText = report.timestamp || 'Récent';

    // KPI Global & Hero Card
    if (kpiGlobal) {
        kpiGlobal.innerText = `${globalScore.toFixed(1)}%`;
        if (globalScore >= 80) {
            kpiGlobal.style.color = '#16a34a';
            if (kpiStatus) { kpiStatus.innerText = 'Excellente conformité (Qualité Production)'; kpiStatus.style.color = '#16a34a'; }
        } else if (globalScore >= 65) {
            kpiGlobal.style.color = '#d97706';
            if (kpiStatus) { kpiStatus.innerText = 'Qualité satisfaisante (Ajustements recommandés)'; kpiStatus.style.color = '#d97706'; }
        } else {
            kpiGlobal.style.color = '#dc2626';
            if (kpiStatus) { kpiStatus.innerText = 'Non conforme (Optimisation requise)'; kpiStatus.style.color = '#dc2626'; }
        }
    }

    const progressBar = document.getElementById('rag-kpi-global-bar');
    if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, globalScore))}%`;
        progressBar.style.backgroundColor = globalScore >= 80 ? '#16a34a' : (globalScore >= 65 ? '#d97706' : '#dc2626');
    }

    const heroCourseEl = document.getElementById('rag-hero-course-title');
    if (heroCourseEl) {
        heroCourseEl.innerText = report.course_title ? `Formation : ${report.course_title}` : (report.base_id ? `ID : ${report.base_id}` : '--');
    }

    // Autres KPI
    if (kpiContext) kpiContext.innerText = `${cRel.toFixed(1)}/100`;
    if (kpiGrounded) kpiGrounded.innerText = `${ground.toFixed(1)}/100`;
    if (kpiAnswer) kpiAnswer.innerText = `${aRel.toFixed(1)}/100`;
    if (kpiLatency) kpiLatency.innerText = `${Math.round(totLat)} ms`;
    if (kpiRetrieval) kpiRetrieval.innerText = `ChromaDB: ${Math.round(retLat)} ms | Gemini: ${Math.round(Math.max(0, totLat - retLat))} ms`;

    // Diagnostic & Recommandations
    if (diagCourse) {
        diagCourse.innerText = report.course_title ? `Formation : ${report.course_title}` : `ID Base : ${report.base_id || 'N/A'}`;
    }

    if (diagContent) {
        const diagCards = [];
        
        // 1. Contexte
        if (cRel >= 80) {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #16a34a;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#16a34a;">✔</span> Recherche Vectorielle (ChromaDB)</div>
                        <span style="font-size:11px; font-weight:700; color:#16a34a; background:#dcfce7; padding:2px 8px; border-radius:12px;">Conforme (${cRel}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Excellente pertinence des chunks récupérés. Les fragments indexés ciblent précisément les concepts attendus.</div>
                </div>
            `);
        } else {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #d97706;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#d97706;">⚠</span> Recherche Vectorielle (ChromaDB)</div>
                        <span style="font-size:11px; font-weight:700; color:#d97706; background:#fef3c7; padding:2px 8px; border-radius:12px;">Bruit (${cRel}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Certains fragments contiennent du bruit. Suggestion : affiner le découpage ou porter top_k à 4 chunks.</div>
                </div>
            `);
        }

        // 2. Fidélité
        if (ground >= 85) {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #16a34a;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#16a34a;">🛡️</span> Fidélité / Non-hallucination</div>
                        <span style="font-size:11px; font-weight:700; color:#16a34a; background:#dcfce7; padding:2px 8px; border-radius:12px;">Ancré (${ground}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Très haute fiabilité factuelle. Aucune hallucination ni extrapolation constatée par l'auditeur IA.</div>
                </div>
            `);
        } else {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #dc2626;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#dc2626;">⚠</span> Fidélité / Non-hallucination</div>
                        <span style="font-size:11px; font-weight:700; color:#dc2626; background:#fee2e2; padding:2px 8px; border-radius:12px;">Risque (${ground}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Risque d'extrapolation détecté. Suggestion : renforcer la consigne d'ancrage strict dans le prompt système.</div>
                </div>
            `);
        }

        // 3. Pertinence réponse
        if (aRel >= 85) {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #16a34a;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#16a34a;">💬</span> Pertinence de la Réponse</div>
                        <span style="font-size:11px; font-weight:700; color:#16a34a; background:#dcfce7; padding:2px 8px; border-radius:12px;">Précis (${aRel}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Réponses directes, concises et strictement professionnelles, conformes aux exigences pédagogiques SGCI.</div>
                </div>
            `);
        } else {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #d97706;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#d97706;">⚠</span> Pertinence de la Réponse</div>
                        <span style="font-size:11px; font-weight:700; color:#d97706; background:#fef3c7; padding:2px 8px; border-radius:12px;">Perfectible (${aRel}/100)</span>
                    </div>
                    <div class="rag-diag-card-desc">Les formulations pourraient être plus directes. Recommandation : réduire les périphrases introductives.</div>
                </div>
            `);
        }

        // 4. Latence
        if (totLat < 2500) {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #16a34a;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#16a34a;">⚡</span> Performance & Vitesse</div>
                        <span style="font-size:11px; font-weight:700; color:#16a34a; background:#dcfce7; padding:2px 8px; border-radius:12px;">Rapide (${Math.round(totLat)}ms)</span>
                    </div>
                    <div class="rag-diag-card-desc">Temps de réponse optimal pour la production temps réel (dont ChromaDB : ${Math.round(retLat)} ms).</div>
                </div>
            `);
        } else {
            diagCards.push(`
                <div class="rag-diag-card" style="border-left: 3px solid #2563eb;">
                    <div class="rag-diag-card-header">
                        <div class="rag-diag-card-title"><span style="color:#2563eb;">ℹ</span> Performance & Vitesse</div>
                        <span style="font-size:11px; font-weight:700; color:#2563eb; background:#dbeafe; padding:2px 8px; border-radius:12px;">Standard (${Math.round(totLat)}ms)</span>
                    </div>
                    <div class="rag-diag-card-desc">Temps de réponse convenable pour l'usage interactif (dont ChromaDB : ${Math.round(retLat)} ms).</div>
                </div>
            `);
        }

        diagContent.innerHTML = `<div class="rag-diag-grid">${diagCards.join('')}</div>`;
    }

    // Tableau des tests
    const tests = report.tests || [];
    if (testsCountEl) testsCountEl.innerText = tests.length.toString();

    if (tbody) {
        if (tests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 25px;">Aucun test unitaire présent dans ce rapport.</td></tr>`;
            return;
        }

        tbody.innerHTML = tests.map(t => {
            const ragScore = t.rag_score || 0;
            let scoreColor = '#16a34a';
            let scoreBg = '#dcfce7';
            if (ragScore < 65) {
                scoreColor = '#dc2626';
                scoreBg = '#fee2e2';
            } else if (ragScore < 80) {
                scoreColor = '#d97706';
                scoreBg = '#fef3c7';
            }

            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="text-align: center; font-weight: 700; color: #64748b;">#${t.test_id}</td>
                    <td style="vertical-align: top; font-weight: 600; color: #0f172a; padding: 12px 14px;">
                        ${escapeRagHtml(t.question || '')}
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: normal;">
                            🔍 ${t.chunks_count || (t.chunks ? t.chunks.length : 0)} fragment(s) extrait(s)
                        </div>
                    </td>
                    <td style="vertical-align: top; color: #334155; font-size: 13px; line-height: 1.4; padding: 12px 14px;">
                        <div style="background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 8px 10px; border-radius: 4px;">
                            ${escapeRagHtml(t.answer || '')}
                        </div>
                        <div style="font-size: 11px; color: #1e40af; margin-top: 4px;">
                            💬 <em>Juge : ${escapeRagHtml(t.judge_comment || '')}</em>
                        </div>
                    </td>
                    <td style="text-align: center; font-weight: 700; color: #0284c7;">
                        ${t.context_relevance}/100
                    </td>
                    <td style="text-align: center; font-weight: 700; color: #16a34a;">
                        ${t.groundedness}/100
                    </td>
                    <td style="text-align: center; font-weight: 700; color: #9333ea;">
                        ${t.answer_relevance}/100
                    </td>
                    <td style="text-align: center;">
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 14px; font-weight: 800; font-size: 12px; background: ${scoreBg}; color: ${scoreColor};">
                            ${t.rag_score}%
                        </span>
                    </td>
                    <td style="text-align: center; font-size: 12px; color: #64748b;">
                        <strong style="color: #0f172a;">${Math.round(t.total_latency_ms || 0)} ms</strong>
                        <div style="font-size: 10px; color: #94a3b8;">(${Math.round(t.retrieval_ms || 0)}ms + ${Math.round(t.generation_ms || 0)}ms)</div>
                    </td>
                    <td style="text-align: center;">
                        <button type="button" onclick="showRagChunkModal(${t.test_id})" class="nav-btn" style="padding: 5px 10px; font-size: 11.5px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer;" title="Inspecter les chunks exacts et le raisonnement">
                            Inspecter Chunks
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
};

window.triggerRagEvaluation = async function() {
    if (!currentUser || currentUser.role !== 'superadmin') {
        alert("Accès réservé exclusivement au Super Administrateur.");
        return;
    }

    const selectCourse = document.getElementById('rag-select-course');
    const courseBaseId = selectCourse ? selectCourse.value : '';
    if (!courseBaseId) {
        alert("Veuillez sélectionner une formation cible indexée dans ChromaDB.");
        return;
    }

    const isSingle = document.querySelector('input[name="rag-eval-mode"][value="single"]')?.checked;
    const mode = isSingle ? 'single' : 'benchmark';
    const queryInput = document.getElementById('rag-custom-query');
    const customQuery = queryInput ? queryInput.value.trim() : '';

    if (isSingle && !customQuery) {
        alert("Veuillez saisir la question à tester en mode direct.");
        if (queryInput) queryInput.focus();
        return;
    }

    const btnSubmit = document.getElementById('btn-run-rag-eval');
    const btnIcon = document.getElementById('btn-run-rag-icon');
    const btnLabel = document.getElementById('btn-run-rag-label');
    const runningState = document.getElementById('rag-eval-running-state');

    // Verrouillage de l'UI
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnIcon) btnIcon.innerText = "⏳";
    if (btnLabel) btnLabel.innerText = "Analyse RAG en cours...";
    if (runningState) runningState.style.display = 'flex';

    try {
        const res = await fetch('/api/admin/rag_evaluation/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUser.id
            },
            body: JSON.stringify({
                user_id: currentUser.id,
                course_base_id: courseBaseId,
                mode: mode,
                query: customQuery,
                n_results: 3
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || "Erreur lors de l'évaluation du RAG");
        }

        window.ragEvaluationData.report = data.report;
        window.renderRagEvaluationDashboard(data.report, window.ragEvaluationData.courses);

        if (typeof showToast === 'function') {
            showToast("Évaluation RAG terminée avec succès !", "success");
        } else {
            alert("Évaluation du pipeline RAG terminée avec succès !");
        }

    } catch (e) {
        console.error("Erreur triggerRagEvaluation:", e);
        alert(`Erreur pendant l'évaluation RAG : ${e.message}`);
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnIcon) btnIcon.innerText = "⚡";
        if (btnLabel) btnLabel.innerText = isSingle ? "Tester la Requête en Direct" : "Lancer le Benchmark Complet";
        if (runningState) runningState.style.display = 'none';
    }
};

window.showRagChunkModal = function(testId) {
    const report = window.ragEvaluationData.report;
    if (!report || !report.tests) return;

    const test = report.tests.find(t => t.test_id === testId);
    if (!test) return;

    const modal = document.getElementById('rag-chunk-modal');
    const modalTitle = document.getElementById('rag-chunk-modal-title');
    const qEl = document.getElementById('rag-chunk-modal-question');
    const aEl = document.getElementById('rag-chunk-modal-answer');
    const jEl = document.getElementById('rag-chunk-modal-judge');
    const countEl = document.getElementById('rag-chunk-modal-count');
    const chunksContainer = document.getElementById('rag-chunk-modal-chunks');

    if (modalTitle) modalTitle.innerText = `Inspection du Test #${test.test_id} (Score RAG : ${test.rag_score}%)`;
    if (qEl) qEl.innerText = test.question || '';
    if (aEl) aEl.innerText = test.answer || '';
    if (jEl) jEl.innerText = test.judge_comment || 'Aucun commentaire du juge.';

    const chunks = test.chunks || [];
    if (countEl) countEl.innerText = chunks.length.toString();

    if (chunksContainer) {
        if (chunks.length === 0) {
            chunksContainer.innerHTML = `<div style="color: #64748b; font-style: italic; font-size: 13px;">Aucun fragment textuel stocké dans les métadonnées de ce rapport (${test.chunks_count || 0} fragment(s) comptabilisé(s)).</div>`;
        } else {
            chunksContainer.innerHTML = chunks.map((chk, idx) => `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <strong style="color: #e9041e; font-size: 12px; text-transform: uppercase;">Fragment #${idx + 1} (ChromaDB)</strong>
                        <span style="font-size: 11px; color: #64748b;">${chk.length} caractères</span>
                    </div>
                    <div style="font-family: 'Consolas', monospace; font-size: 12.5px; color: #1e293b; white-space: pre-wrap; line-height: 1.5; max-height: 180px; overflow-y: auto; background: white; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        ${escapeRagHtml(chk)}
                    </div>
                </div>
            `).join('');
        }
    }

    if (modal) modal.style.display = 'flex';
};

window.closeRagChunkModal = function() {
    const modal = document.getElementById('rag-chunk-modal');
    if (modal) modal.style.display = 'none';
};

window.exportRagReportJson = function() {
    if (!currentUser || currentUser.role !== 'superadmin') {
        alert("Accès réservé exclusivement au Super Administrateur.");
        return;
    }
    const report = window.ragEvaluationData.report;
    if (!report) {
        alert("Aucun rapport d'évaluation RAG à exporter.");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_");
    dlAnchor.setAttribute("download", `SGCI_RAG_Benchmark_Report_${ts}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
};

window.filterRagEvaluationTable = function() {
    const searchInput = document.getElementById('rag-table-search');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const rows = document.querySelectorAll('#rag-eval-tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
};


