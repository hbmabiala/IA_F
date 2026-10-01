"""
SUITE DE TESTS AUTOMATISÉE : PIPELINE UPLOAD ASYNCHRONE & PERSISTANCE DE DONNÉES
"""

import os
import sys
import json
import time
import shutil
import tempfile
import unittest

# Fix stdout encoding on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Définir DATA_DIR temporaire pour les tests de persistance
TEST_DATA_DIR = os.path.join(tempfile.gettempdir(), 'test_tchia_data_' + str(int(time.time())))
os.environ['DATA_DIR'] = TEST_DATA_DIR

from server import (
    app, init_db, get_db_connection, DATA_DIR, DB_PATH,
    backup_database_to_json, restore_database_from_json, AUTO_BACKUP_PATH
)
from ai_generator import (
    get_chroma_collection, generate_standard_document_name, get_archived_course_path
)

def run_pipeline_tests():
    print("=" * 70)
    print("TEST DU PIPELINE UPLOAD ASYNCHRONE & SYSTEME DE PERSISTANCE")
    print(f"Repertoire de persistance de test (DATA_DIR) : {TEST_DATA_DIR}")
    print("=" * 70)

    client = app.test_client()
    success = True

    # -------------------------------------------------------------
    # TEST 1 : Vérification de la structure DATA_DIR
    # -------------------------------------------------------------
    try:
        assert os.path.exists(TEST_DATA_DIR), "DATA_DIR n'a pas été créé"
        assert DB_PATH.startswith(TEST_DATA_DIR), "DB_PATH doit être dans DATA_DIR"
        print("[OK] [TEST 1] Configuration DATA_DIR et base SQLite valides.")
    except Exception as e:
        print(f"[FAIL] [TEST 1] : {e}")
        success = False

    # -------------------------------------------------------------
    # TEST 2 : Test Sauvegarde & Restauration Automatique JSON
    # -------------------------------------------------------------
    try:
        conn = get_db_connection()
        conn.execute("INSERT OR REPLACE INTO users (id, matricule, password, nom, prenom, email, role) VALUES (999, 'TEST999', 'pass123', 'TestPersist', 'User', 'test@sgci.ci', 'user')")
        conn.commit()
        conn.close()

        # Forcer la sauvegarde JSON
        backup_database_to_json()
        assert os.path.exists(AUTO_BACKUP_PATH), f"Le fichier {AUTO_BACKUP_PATH} doit exister"

        # Simuler une suppression de la base SQLite
        conn = get_db_connection()
        conn.execute("DELETE FROM courses")
        conn.execute("DELETE FROM users")
        conn.commit()
        conn.close()

        # Tester la restauration automatique
        restore_database_from_json()
        conn = get_db_connection()
        restored_user = conn.execute("SELECT * FROM users WHERE matricule = 'TEST999'").fetchone()
        conn.close()

        assert restored_user is not None, "L'utilisateur sauvegardé n'a pas été restauré !"
        assert restored_user['nom'] == 'TestPersist', "Données restaurées corrompues !"
        print("[OK] [TEST 2] Sauvegarde & Restauration automatique JSON opérationnelle.")
    except Exception as e:
        print(f"[FAIL] [TEST 2] : {e}")
        success = False

    # -------------------------------------------------------------
    # TEST 3 : Nomenclatures Fichiers Multi-Formats (PDF, MP4, MP3, PPTX, Image)
    # -------------------------------------------------------------
    try:
        doc_pdf = generate_standard_document_name("Formations Risques", "SUPPORT_COURS", 1, "pdf")
        doc_pptx = generate_standard_document_name("Audit Interne", "PRESENTATION", 2, "pptx")
        doc_mp3 = generate_standard_document_name("Compliance Audio", "RESSOURCE", 1, "mp3")
        
        assert doc_pdf.endswith('.pdf'), "L'extension PDF doit être conservée"
        assert doc_pptx.endswith('.pptx'), "L'extension PPTX doit être conservée"
        assert doc_mp3.endswith('.mp3'), "L'extension MP3 doit être conservée"
        print("[OK] [TEST 3] Génération des noms normalisés SGCI multi-formats conforme.")
    except Exception as e:
        print(f"[FAIL] [TEST 3] : {e}")
        success = False

    # -------------------------------------------------------------
    # TEST 4 : Endpoint Polling Task Status (Erreur 404 / 200)
    # -------------------------------------------------------------
    try:
        res_404 = client.get('/api/task_status/fake-task-id-1234')
        assert res_404.status_code == 404, "Une tâche inexistante doit renvoyer HTTP 404"
        data_404 = res_404.get_json()
        assert data_404['status'] == 'not_found', "Le statut doit être 'not_found'"
        print("[OK] [TEST 4] Endpoint /api/task_status/<task_id> sécurisé.")
    except Exception as e:
        print(f"[FAIL] [TEST 4] : {e}")
        success = False

    # -------------------------------------------------------------
    # TEST 5 : ChromaDB avec DATA_DIR
    # -------------------------------------------------------------
    try:
        col = get_chroma_collection()
        assert col is not None, "La collection ChromaDB doit s'initialiser correctement"
        print("[OK] [TEST 5] Base vectorielle RAG ChromaDB compatible DATA_DIR.")
    except Exception as e:
        print(f"[FAIL] [TEST 5] : {e}")
        success = False

    # Nettoyage
    try:
        shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    except Exception:
        pass

    print("=" * 70)
    if success:
        print("TOUS LES TESTS DE PIPELINE ET PERSISTANCE ONT REUSSI ! (100%)")
    else:
        print("DES ECHECS ONT ETE DETECTES.")
    print("=" * 70)
    return success

if __name__ == '__main__':
    run_pipeline_tests()
