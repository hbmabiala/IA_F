import os
import sqlite3
from datetime import datetime, timedelta

db_p = os.path.join(os.path.dirname(__file__), 'data', 'database.db') if os.path.exists(os.path.join(os.path.dirname(__file__), 'data', 'database.db')) else os.path.join(os.path.dirname(__file__), 'database.db')
conn = sqlite3.connect(db_p, timeout=30.0)
conn.row_factory = sqlite3.Row

# 1. Comptes de test documentés dans README
conn.execute('''
    INSERT OR IGNORE INTO users (matricule, password, nom, prenom, email, poste, direction, role, statut_contrat, date_embauche)
    VALUES ('MAT001', 'pass123', 'KOUASSI', 'Yves', 'y.kouassi@sgci.ci', 'Conseiller Clientèle', 'Réseau Agences', 'user', 'CDI', '2025-03-01')
''')
conn.execute('''
    INSERT OR IGNORE INTO users (matricule, password, nom, prenom, email, poste, direction, role, statut_contrat, date_embauche)
    VALUES ('MAT002', 'pass123', 'AKE', 'Marc', 'm.ake@sgci.ci', 'Analyste Crédit', 'Direction Engagements', 'user', 'CDI', '2025-06-15')
''')

# 2. Formations bancaires SGCI avec supports (PDF & PPTX)
demo_courses = [
    (101, 'Conformité Bancaire & LCB-FT', 'Maîtrise des directives prudentielles et lutte anti-blanchiment SGCI', 'Conformité', 2.0, 'Débutant', 'assigned', 'course_101'),
    (102, 'Gestion des Risques Opérationnels', 'Dispositif de maîtrise et de surveillance des risques bancaires', 'Risques', 3.0, 'Intermédiaire', 'assigned', 'course_102'),
    (103, 'Secret Professionnel & Éthique SGCI', 'Protection des données clients et déontologie bancaire', 'Éthique', 1.5, 'Débutant', 'public', 'course_103')
]

for cid, title, desc, domain, duration, level, vis, bname in demo_courses:
    pdf_path = f'/static/courses/{bname}.pdf'
    pptx_path = f'/static/courses/{bname}.pptx'
    conn.execute('''
        INSERT OR IGNORE INTO courses (id, title, desc, domain, duration, level, visibility, pdf_url, pptx_url, base_filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (cid, title, desc, domain, duration, level, vis, pdf_path, pptx_path, bname))
    conn.execute('''
        UPDATE courses SET pdf_url=?, pptx_url=?, base_filename=? WHERE id=? AND (pdf_url IS NULL OR pdf_url='' OR pptx_url IS NULL OR pptx_url='')
    ''', (pdf_path, pptx_path, bname, cid))

u1_row = conn.execute("SELECT id FROM users WHERE matricule='MAT001'").fetchone()
u2_row = conn.execute("SELECT id FROM users WHERE matricule='MAT002'").fetchone()

if u1_row and u2_row:
    u1 = u1_row['id']
    u2 = u2_row['id']

    now = datetime.now()
    d_plus_7 = (now + timedelta(days=7)).strftime('%Y-%m-%d 23:59:59')
    d_minus_3 = (now - timedelta(days=3)).strftime('%Y-%m-%d 23:59:59')

    # 3. Assignations
    conn.execute('''
        INSERT OR REPLACE INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue, qcm_score, oral_score, final_score, passed, completed_at)
        VALUES (?, 101, 1, 'passed', ?, 0, 85.0, 80.0, 83.5, 1, ?)
    ''', (u1, d_plus_7, now.strftime('%Y-%m-%d %H:%M:%S')))

    conn.execute('''
        INSERT OR REPLACE INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue, qcm_score)
        VALUES (?, 102, 1, 'in_progress', ?, 0, 70.0)
    ''', (u1, d_plus_7))

    conn.execute('''
        INSERT OR REPLACE INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue)
        VALUES (?, 101, 1, 'assigned', ?, 0)
    ''', (u2, d_plus_7))

    # 4. Progression & Évaluations
    conn.execute('''
        INSERT OR REPLACE INTO user_course_progress (user_id, course_id, current_slide, total_slides, progress_percent, completed_training)
        VALUES (?, 101, 10, 10, 100, 1)
    ''', (u1,))
    conn.execute('''
        INSERT OR REPLACE INTO user_course_progress (user_id, course_id, current_slide, total_slides, progress_percent, completed_training)
        VALUES (?, 102, 4, 10, 40, 0)
    ''', (u1,))

    conn.execute('''
        INSERT OR REPLACE INTO course_evaluations (user_id, course_id, score, passed, correct_answers, total_questions)
        VALUES (?, 101, 85.0, 1, 13, 15)
    ''', (u1,))

    conn.execute('''
        INSERT OR REPLACE INTO oral_evaluations (course_id, user_id, transcript, score_oral, feedback)
        VALUES (101, ?, 'Argumentation claire et respect du secret bancaire SGCI.', 80.0, 'Validation complète.')
    ''', (u1,))

    # 5. Téléchargements
    conn.execute('''
        INSERT OR IGNORE INTO document_downloads (user_id, course_id, module_id, doc_type, filename)
        VALUES (?, 101, 1, 'PDF', 'SGCI_MALAMIA_SUPPORT_COURS_CONFORMITE_M1_V1.pdf')
    ''', (u1,))
    conn.execute('''
        INSERT OR IGNORE INTO document_downloads (user_id, course_id, module_id, doc_type, filename)
        VALUES (?, 102, 1, 'PPTX', 'SGCI_MALAMIA_PRESENTATION_RISQUES_M1_V1.pptx')
    ''', (u1,))

conn.commit()
conn.close()
print("Données de démonstration et de pilotage MALAM'IA initialisées avec succès.")
