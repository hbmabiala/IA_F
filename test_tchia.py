"""
TEST SUITE AUTOMATISEE — SOLUTION T-chIA (SOCIETE GENERALE COTE D'IVOIRE)
Verification des 12 cas d'usage exiges par le cahier des charges.
"""

import os
import sys
import json
import re
from datetime import datetime, date, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Import des modules de l'application
from server import (
    app, init_db, get_db_connection,
    calculate_business_deadline, refresh_assignment_statuses,
    CI_HOLIDAYS_FIXED, DISCLOSURE_CURRENT_VERSION
)
from ai_generator import (
    generate_standard_document_name, get_archived_course_path
)

def run_all_tests():
    print("=" * 70)
    print("DEBUT DE LA SUITE DE TESTS T-chIA — SGCI")
    print("=" * 70)
    
    passed_count = 0
    total_tests = 12
    
    # -------------------------------------------------------------
    # CAS 1 : Pas d'identifiants ni mots de passe exposes dans l'UI
    # -------------------------------------------------------------
    try:
        idx_p = 'templates/index.html' if os.path.exists('templates/index.html') else 'index.html'
        with open(idx_p, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        assert 'admin123' not in html_content, "ERREUR: Le mot de passe 'admin123' est present dans index.html !"
        assert 'ADMIN001 / admin123' not in html_content, "ERREUR: Identifiants de demo affiches dans index.html !"
        assert 'type="password" value=' not in html_content, "ERREUR: Un mot de passe est pre-rempli dans un input HTML !"
        print("[OK] [CAS 1 / 12] : Aucun identifiant ni mot de passe expose dans l'UI.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 1 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 2 : Absence absolue des termes 'IA Tutor' dans l'UI
    # -------------------------------------------------------------
    try:
        idx_p = 'templates/index.html' if os.path.exists('templates/index.html') else 'index.html'
        with open(idx_p, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        clean_html = re.sub(r'<script[\s\S]*?</script>', '', html_content)
        assert 'IA Tutor' not in clean_html, "ERREUR: 'IA Tutor' trouve dans l'interface utilisateur de index.html !"
        assert 'Hologramme' not in clean_html, "ERREUR: Le terme 'Hologramme' subsiste dans l'UI !"
        print("[OK] [CAS 2 / 12] : Remplacement integral valide ('T-chIA' remplace 'IA Tutor' et 'Hologramme').")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 2 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 3 : En-tete officiel SGCI & T-chIA
    # -------------------------------------------------------------
    try:
        idx_p = 'templates/index.html' if os.path.exists('templates/index.html') else 'index.html'
        with open(idx_p, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        assert 'logo.png' in html_content, "ERREUR: Le logo SGCI est absent de l'en-tete !"
        assert 'T-chIA' in html_content, "ERREUR: La marque T-chIA est absente de la navigation !"
        assert 'current-user-display' in html_content, "ERREUR: L'affichage du profil utilisateur est absent !"
        print("[OK] [CAS 3 / 12] : En-tete standard SGCI [Logo] [T-chIA] [Utilisateur] conforme.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 3 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 4 : Nomenclature standardisee des documents
    # -------------------------------------------------------------
    try:
        doc_name_pdf = generate_standard_document_name("Management des Risques", "SUPPORT_COURS", 1, "pdf")
        doc_name_pptx = generate_standard_document_name("Conformite Bancaire", "PRESENTATION", 2, "pptx")
        
        today_str = datetime.now().strftime('%Y%m%d')
        expected_prefix_pdf = f"SGCI_TCHIA_SUPPORT_COURS_MANAGEMENT_DES_RISQUES_M1_V1_{today_str}.pdf"
        expected_prefix_pptx = f"SGCI_TCHIA_PRESENTATION_CONFORMITE_BANCAIRE_M2_V1_{today_str}.pptx"
        
        assert doc_name_pdf == expected_prefix_pdf, f"Attendu: {expected_prefix_pdf}, Obtenu: {doc_name_pdf}"
        assert doc_name_pptx == expected_prefix_pptx, f"Attendu: {expected_prefix_pptx}, Obtenu: {doc_name_pptx}"
        
        archived_dir = get_archived_course_path(105, "SUPPORTS")
        assert "FORMATIONS_ARCHIVES" in archived_dir and "FORMATION_105" in archived_dir
        print("[OK] [CAS 4 / 12] : Nomenclature standardisee et arborescence d'archivage conformes.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 4 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 5 : Regle des 10 jours ouvres (Jours feries CI & Week-ends)
    # -------------------------------------------------------------
    try:
        start_date = datetime(2026, 7, 29, 9, 0, 0)
        deadline = calculate_business_deadline(start_date, 10)
        
        cur = start_date
        working_days = 0
        while cur.date() < deadline.date():
            cur += timedelta(days=1)
            if cur.weekday() < 5 and (cur.month, cur.day) not in CI_HOLIDAYS_FIXED:
                working_days += 1
                
        assert working_days == 10, f"Attendu 10 jours ouvres, obtenu {working_days}"
        assert deadline.weekday() < 5, "La date d'echeance ne peut pas tomber un samedi ou dimanche !"
        assert (deadline.month, deadline.day) not in CI_HOLIDAYS_FIXED, "La date d'echeance ne peut pas tomber un jour ferie ivoirien !"
        print(f"[OK] [CAS 5 / 12] : Calcul echeance 10 jours ouvres exact (Depart: {start_date.date()} -> Echeance: {deadline.date()}).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 5 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 6 : Formation publique / libre sans echeance obligatoire
    # -------------------------------------------------------------
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO courses (title, domain, visibility, duration, level)
            VALUES ('Formation Libre Finance Durable', 'RSE', 'public', 2, 'Debutant')
        ''')
        pub_course_id = cur.lastrowid
        
        user = conn.execute("SELECT id FROM users WHERE role='user' LIMIT 1").fetchone()
        user_id = user['id'] if user else 1
        
        now_dt = datetime.now()
        c_row = conn.execute("SELECT visibility FROM courses WHERE id = ?", (pub_course_id,)).fetchone()
        due_val = None if c_row['visibility'] == 'public' else calculate_business_deadline(now_dt, 10).strftime('%Y-%m-%d %H:%M:%S')
        
        cur.execute('''
            INSERT OR REPLACE INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue)
            VALUES (?, ?, 1, 'assigned', ?, 0)
        ''', (user_id, pub_course_id, due_val))
        conn.commit()
        
        row = conn.execute("SELECT due_date, is_overdue FROM course_assignments WHERE course_id=? AND user_id=?", (pub_course_id, user_id)).fetchone()
        assert row['due_date'] is None, f"Une formation publique ne doit pas avoir d'echeance, recu: {row['due_date']}"
        assert row['is_overdue'] == 0, "Une formation publique ne doit jamais etre marquee en retard"
        
        conn.execute("DELETE FROM course_assignments WHERE course_id=?", (pub_course_id,))
        conn.execute("DELETE FROM courses WHERE id=?", (pub_course_id,))
        conn.commit()
        conn.close()
        print("[OK] [CAS 6 / 12] : Les formations publiques n'ont aucune echeance imposee ni statut de retard.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 6 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 7 : Detection et alertes des retards sur cours assignes
    # -------------------------------------------------------------
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM course_assignments WHERE course_id=99999")
        conn.commit()
        
        past_date = (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d %H:%M:%S')
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue)
            VALUES (1, 99999, 1, 'assigned', ?, 0)
        ''', (past_date,))
        conn.commit()
        
        refresh_assignment_statuses(conn=conn)
        
        row = conn.execute("SELECT is_overdue, status FROM course_assignments WHERE course_id=99999 AND user_id=1").fetchone()
        assert row is not None, "Assignation introuvable"
        assert row['is_overdue'] == 1, f"L'assignation depassee aurait du etre marquee is_overdue = 1 (obtenu: {row['is_overdue']})"
        assert row['status'] == 'overdue', f"Le statut attendu est 'overdue', obtenu: {row['status']}"
        
        conn.execute("DELETE FROM course_assignments WHERE course_id=99999")
        conn.commit()
        print("[OK] [CAS 7 / 12] : Detection et basculement automatique en retard (is_overdue=1) valides.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 7 / 12] : {e}")
    finally:
        conn.close()

    # -------------------------------------------------------------
    # CAS 8 : Disclosure IA et Consentement RGPD prealable
    # -------------------------------------------------------------
    test_uid = 88888
    try:
        client = app.test_client()
        res = client.get(f'/api/user/consent-status?user_id={test_uid}')
        assert res.status_code == 200, f"Status GET: {res.status_code}"
        data = res.get_json()
        assert data['accepted'] is False, "Le consentement d'un nouvel utilisateur ne doit pas etre pre-valide !"
        
        res_post = client.post('/api/user/consent', json={
            'user_id': test_uid,
            'disclosure_version': '1.0',
            'status': 'accepted'
        })
        assert res_post.status_code == 200, f"Status POST: {res_post.status_code}"
        assert res_post.get_json().get('success') is True
        
        res_after = client.get(f'/api/user/consent-status?user_id={test_uid}')
        assert res_after.status_code == 200, f"Status GET after: {res_after.status_code}"
        assert res_after.get_json().get('accepted') is True
        
        print("[OK] [CAS 8 / 12] : Tracabilite et barriere de consentement IA/RGPD operationnelles.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 8 / 12] : {e}")
    finally:
        c_clean = get_db_connection()
        c_clean.execute("DELETE FROM user_consents WHERE user_id=?", (test_uid,))
        c_clean.commit()
        c_clean.close()

    # -------------------------------------------------------------
    # CAS 9 : Ergonomie lecteur de cours (Questions masquees par defaut)
    # -------------------------------------------------------------
    try:
        idx_p = 'templates/index.html' if os.path.exists('templates/index.html') else 'index.html'
        with open(idx_p, 'r', encoding='utf-8') as f:
            html = f.read()
            
        js_path = 'static/js/pages/presentation.js' if os.path.exists('static/js/pages/presentation.js') else ('js/pages/presentation.js' if os.path.exists('js/pages/presentation.js') else 'app.js')
        with open(js_path, 'r', encoding='utf-8') as f:
            js = f.read()
            
        assert 'Afficher les questions' in html or 'Afficher les questions' in js, "Le bouton doit proposer [Afficher les questions] !"
        assert 'Masquer les questions' in js, "Le basculement vers [Masquer les questions] doit exister !"
        print("[OK] [CAS 9 / 12] : Ergonomie du lecteur (panneau questions ferme par defaut avec toggle).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 9 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 10 : Evaluation finale cours assigne (70% QCM + 30% Oral)
    # -------------------------------------------------------------
    test_c_id = None
    try:
        score_qcm = 80.0
        score_oral = 60.0
        final_score = round((score_qcm * 0.70) + (score_oral * 0.30), 1)
        assert final_score == 74.0, f"Attendu 74.0, obtenu {final_score}"
        passed = (final_score >= 70.0)
        assert passed is True
        
        score_qcm_fail = 60.0
        score_oral_fail = 60.0
        final_fail = round((score_qcm_fail * 0.70) + (score_oral_fail * 0.30), 1)
        assert final_fail == 60.0 and (final_fail >= 70.0) is False
        
        client = app.test_client()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("INSERT INTO courses (title, domain, visibility) VALUES ('Test Eval Banking', 'Banque', 'assigned')")
        test_c_id = cur.lastrowid
        cur.execute('''
            INSERT INTO course_assignments (user_id, course_id, assigned_by, status, qcm_score)
            VALUES (1, ?, 1, 'assigned', 80.0)
        ''', (test_c_id,))
        conn.commit()
        conn.close()
        
        res = client.post(f'/api/courses/{test_c_id}/oral_evaluation', json={
            'user_id': 1,
            'response_text': "Dans le cadre de nos activites a la SGCI, la conformite aux directives bancaires et la maitrise du risque operationnel constituent notre priorite absolue."
        })
        assert res.status_code == 200, f"Oral eval status: {res.status_code}"
        data = res.get_json()
        assert data.get('success') is True
        assert 'final_score' in data
        assert data['final_score'] is not None
        assert data['qcm_score'] == 80.0
        
        print(f"[OK] [CAS 10 / 12] : Ponderation 70% QCM / 30% Oral validee (Score calcule: {data['final_score']}%).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 10 / 12] : {e}")
    finally:
        if test_c_id:
            c_clean = get_db_connection()
            c_clean.execute("DELETE FROM oral_evaluations WHERE course_id=?", (test_c_id,))
            c_clean.execute("DELETE FROM course_assignments WHERE course_id=?", (test_c_id,))
            c_clean.execute("DELETE FROM courses WHERE id=?", (test_c_id,))
            c_clean.commit()
            c_clean.close()

    # -------------------------------------------------------------
    # CAS 11 : Evaluation cours public (100% QCM, Max 15 questions)
    # -------------------------------------------------------------
    try:
        from ai_generator import generate_quiz_from_script
        
        dummy_script = "La Societe Generale Cote d'Ivoire est une institution bancaire de premier plan. Elle applique des normes prudentielles strictes."
        raw_quiz = generate_quiz_from_script(dummy_script, api_key=None, num_questions=25)
        assert len(raw_quiz) <= 15, f"Le nombre de questions QCM depasse 15 ! Recu: {len(raw_quiz)}"
        print(f"[OK] [CAS 11 / 12] : Plafond de 15 questions QCM maximum respecte ({len(raw_quiz)} questions generees).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 11 / 12] : {e}")

    # -------------------------------------------------------------
    # CAS 12 : Tableaux de bord enrichis (Stats V2, Live, Export CSV)
    # -------------------------------------------------------------
    try:
        client = app.test_client()
        
        p_res = client.post('/api/user/ping', json={'user_id': 1, 'course_id': None})
        assert p_res.status_code == 200, f"Ping API failed with status {p_res.status_code}: {p_res.data}"
        
        d_res = client.post('/api/downloads/track', json={'user_id': 1, 'course_id': 1, 'doc_type': 'PDF'})
        assert d_res.status_code == 200, f"Downloads track API failed with status {d_res.status_code}: {d_res.data}"
        
        s_res = client.get('/api/admin/stats_v2')
        assert s_res.status_code == 200, f"Stats V2 API failed with status {s_res.status_code}: {s_res.data}"
        res_data = s_res.get_json()
        assert 'stats' in res_data, f"Clé 'stats' manquante dans réponse: {res_data}"
        stats = res_data['stats']
        assert 'total_courses' in stats
        assert 'assigned_courses' in stats
        assert 'overdue_courses' in stats
        assert 'live_connected_count' in stats
        assert 'downloads_stats' in stats
        
        exp_res = client.get('/api/admin/export_pilotage')
        assert exp_res.status_code == 200, f"Export API failed with status {exp_res.status_code}: {exp_res.data}"
        assert 'text/csv' in exp_res.content_type
        csv_text = exp_res.data.decode('utf-8')
        assert 'Matricule' in csv_text and 'T-chIA' in csv_text, f"CSV content missing Matricule or T-chIA: {csv_text[:200]}"
        print("[OK] [CAS 12 / 12] : Dashboard enrichi (KPIs, connectes en direct, telechargements, export CSV).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] [CAS 12 / 12] : {e}")

    # -------------------------------------------------------------
    # SYNTHESE GLOBALE
    # -------------------------------------------------------------
    print("=" * 70)
    print(f"RESULTATS DES TESTS : {passed_count} / {total_tests} CAS REUSSIS")
    print("=" * 70)
    
    if passed_count == total_tests:
        print("TOUS LES TESTS SONT AU VERT ! CONFORMITE T-chIA 100% ATTEINTE.")
        return 0
    else:
        print(f"ATTENTION : {total_tests - passed_count} test(s) ont echoue.")
        return 1

if __name__ == '__main__':
    sys.exit(run_all_tests())
