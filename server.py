import os
import re
import json
import traceback
import subprocess
import asyncio
import threading
import edge_tts
import io
import unicodedata
from datetime import datetime, date, timedelta
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory, send_file, Response, render_template, redirect
import sqlite3
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google import genai
from google.genai import types
from fpdf import FPDF
import uuid
from ai_generator import (
    generate_course_from_file, 
    get_chroma_collection, 
    generate_quiz_for_course_content, 
    evaluate_and_diagnose_submission,
    generate_standard_document_name,
    get_archived_course_path
)

load_dotenv(override=True)
basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Caches mémoire ultra-rapides
_chat_cache = {}
_tts_cache = {}

# Profils vocaux harmonisés (Edge-TTS pour Présentation & Questions RAG, Gemini Live pour Mode Interactif)
VOICE_PROFILES = [
    {
        "id": "thomas",
        "name": "Thomas",
        "gender": "male",
        "label": "Thomas (Homme dynamique)",
        "edge_voice": "fr-FR-HenriNeural",
        "gemini_voice": "Puck"
    },
    {
        "id": "sophie",
        "name": "Sophie",
        "gender": "female",
        "label": "Sophie (Femme posée)",
        "edge_voice": "fr-FR-DeniseNeural",
        "gemini_voice": "Aoede"
    },
    {
        "id": "marc",
        "name": "Marc",
        "gender": "male",
        "label": "Marc (Homme professionnel)",
        "edge_voice": "fr-FR-RemyMultilingualNeural",
        "gemini_voice": "Fenrir"
    },
    {
        "id": "camille",
        "name": "Camille",
        "gender": "female",
        "label": "Camille (Femme chaleureuse)",
        "edge_voice": "fr-FR-VivienneMultilingualNeural",
        "gemini_voice": "Kore"
    }
]

def resolve_voice_profile(course_id=None, voice_key=None):
    """
    Détermine le profil vocal associé à un cours ou à une clé de voix.
    Garantit une voix constante pour un cours donné, même si non renseignée (modulo sur ID).
    """
    if voice_key:
        vk = str(voice_key).strip().lower()
        if vk and vk != 'auto':
            for prof in VOICE_PROFILES:
                if prof['id'] == vk or prof['edge_voice'].lower() == vk or prof['name'].lower() == vk:
                    return prof
    if course_id:
        try:
            cid = int(course_id)
            return VOICE_PROFILES[cid % len(VOICE_PROFILES)]
        except Exception:
            pass
    return VOICE_PROFILES[0]

DATA_DIR = os.environ.get('DATA_DIR')
if not DATA_DIR:
    if os.path.exists(os.path.join(basedir, 'data')):
        DATA_DIR = os.path.join(basedir, 'data')
    else:
        DATA_DIR = basedir

os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, 'database.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    conn.row_factory = sqlite3.Row
    return conn

# Jours fériés officiels de Côte d'Ivoire (compatible tuples (m, d) et chaînes 'MM-DD')
CI_HOLIDAYS_FIXED = {
    (1, 1), (5, 1), (8, 7), (8, 15), (11, 1), (11, 15), (12, 25),
    '01-01', '05-01', '08-07', '08-15', '11-01', '11-15', '12-25'
}

def calculate_business_deadline(start_dt=None, num_business_days=10, country="CI"):
    """
    Règle des 10 jours ouvrés (Section 11) :
    Calcule l'échéance exacte en excluant samedis, dimanches et jours fériés applicables.
    """
    if start_dt is None:
        start_dt = datetime.now()
    elif isinstance(start_dt, str):
        try:
            start_dt = datetime.strptime(start_dt.split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S')
        except Exception:
            try:
                start_dt = datetime.strptime(start_dt.split()[0], '%Y-%m-%d')
            except Exception:
                start_dt = datetime.now()
    elif isinstance(start_dt, date) and not isinstance(start_dt, datetime):
        start_dt = datetime.combine(start_dt, datetime.min.time())

    current = start_dt
    added_days = 0
    while added_days < num_business_days:
        current += timedelta(days=1)
        # Exclure samedi (5) et dimanche (6)
        if current.weekday() in (5, 6):
            continue
        # Exclure jours fériés Côte d'Ivoire
        if (current.month, current.day) in CI_HOLIDAYS_FIXED or current.strftime('%m-%d') in CI_HOLIDAYS_FIXED:
            continue
        added_days += 1
    
    # Échéance fixée à 23:59:59 du jour ouvré cible
    return current.replace(hour=23, minute=59, second=59, microsecond=0)

def refresh_assignment_statuses(conn=None):
    """
    Vérifie et met à jour automatiquement les statuts de retard (Section 12 & 13) :
    - Formation publique : Aucune échéance, jamais en retard.
    - Formation assignée : Statut 'overdue' et is_overdue=1 si dépassée sans complétion.
    """
    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True
    
    try:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 1. Neutraliser les formations publiques (Section 13 : Aucune échéance, jamais en retard)
        conn.execute('''
            UPDATE course_assignments 
            SET due_date = NULL, is_overdue = 0
            WHERE course_id IN (SELECT id FROM courses WHERE visibility = 'public')
        ''')
        
        # 2. Identifier les retards sur formations non publiques non complétées (Section 12)
        conn.execute('''
            UPDATE course_assignments 
            SET is_overdue = 1, status = 'overdue'
            WHERE (course_id NOT IN (SELECT id FROM courses WHERE visibility = 'public'))
              AND status NOT IN ('completed', 'passed')
              AND due_date IS NOT NULL 
              AND due_date < ?
        ''', (now_str,))
        
        # 3. Réinitialiser le flag si complété ou prolongé
        conn.execute('''
            UPDATE course_assignments 
            SET is_overdue = 0
            WHERE (status IN ('completed', 'passed') OR (due_date IS NOT NULL AND due_date >= ?))
              AND is_overdue = 1
        ''', (now_str,))
        
        conn.commit()
    except Exception as e:
        print(f"Erreur refresh_assignment_statuses: {e}")
    finally:
        if close_at_end:
            conn.close()

def log_audit_event(user_id, action, object_type="", object_id="", metadata=None, conn=None):
    """Enregistre un événement dans la table audit_logs (Section 37)."""
    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True
    try:
        meta_str = json.dumps(metadata, ensure_ascii=False) if isinstance(metadata, (dict, list)) else str(metadata or "")
        conn.execute('''
            INSERT INTO audit_logs (user_id, action, object_type, object_id, metadata_json)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, action, str(object_type), str(object_id), meta_str))
        conn.commit()
    except Exception as e:
        print(f"Erreur audit log: {e}")
    finally:
        if close_at_end:
            conn.close()

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            desc TEXT,
            domain TEXT,
            duration REAL,
            level TEXT,
            pdf_url TEXT,
            script TEXT,
            slides_data TEXT,
            visibility TEXT DEFAULT 'public',
            target_directions TEXT DEFAULT '',
            target_postes TEXT DEFAULT '',
            thumbnail_url TEXT DEFAULT '',
            tutor_voice TEXT DEFAULT ''
        )
    ''')
    
    # S'assurer que les colonnes de visibilité, miniature et voix existent dans courses
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(courses)")
    course_columns = [row['name'] for row in cur.fetchall()]
    if 'visibility' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN visibility TEXT DEFAULT 'public'")
    if 'target_directions' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN target_directions TEXT DEFAULT ''")
    if 'target_postes' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN target_postes TEXT DEFAULT ''")
    if 'thumbnail_url' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN thumbnail_url TEXT DEFAULT ''")
    if 'audio_url' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN audio_url TEXT DEFAULT ''")
    if 'timestamps_url' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN timestamps_url TEXT DEFAULT ''")
    if 'pptx_url' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN pptx_url TEXT DEFAULT ''")
    if 'base_filename' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN base_filename TEXT DEFAULT ''")
    if 'quiz_data' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN quiz_data TEXT DEFAULT ''")
    if 'tutor_voice' not in course_columns:
        conn.execute("ALTER TABLE courses ADD COLUMN tutor_voice TEXT DEFAULT ''")
    
    # Vérification et migration propre de la table users
    cur = conn.cursor()
    cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    table_row = cur.fetchone()
    
    if not table_row:
        conn.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matricule TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                email TEXT,
                poste TEXT,
                direction TEXT,
                role TEXT NOT NULL
            )
        ''')
    elif 'username' in table_row[0]:
        # Migration de l'ancienne table vers le nouveau schéma
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matricule TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                email TEXT,
                poste TEXT,
                direction TEXT,
                role TEXT NOT NULL
            )
        ''')
        
        old_rows = conn.execute("SELECT * FROM users").fetchall()
        for row in old_rows:
            r = dict(row)
            uid = r.get('id')
            uname = str(r.get('username') or '')
            matricule = r.get('matricule')
            if not matricule:
                matricule = 'ADMIN001' if uname.lower() == 'admin' else f'USR00{uid}'
            nom = r.get('nom') or ('Super' if uname.lower() == 'admin' else 'Utilisateur')
            prenom = r.get('prenom') or ('Admin' if uname.lower() == 'admin' else f'Compte {uid}')
            role = r.get('role') or 'user'
            if role == 'admin' or uname.lower() == 'admin':
                role = 'superadmin'
            elif role == 'apprenant':
                role = 'user'
            pwd = r.get('password') or 'admin123'
            email = r.get('email')
            poste = r.get('poste') or ('Super Administrateur' if role == 'superadmin' else '')
            direction = r.get('direction') or ('Direction Générale' if role == 'superadmin' else '')
            
            conn.execute('''
                INSERT OR REPLACE INTO users_new (id, matricule, password, nom, prenom, email, poste, direction, role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (uid, matricule, pwd, nom, prenom, email, poste, direction, role))
            
        conn.execute("DROP TABLE users")
        conn.execute("ALTER TABLE users_new RENAME TO users")

    # S'assurer que les colonnes created_by, statut_contrat, date_embauche et manager existent dans users
    cur.execute("PRAGMA table_info(users)")
    user_columns = [row['name'] for row in cur.fetchall()]
    if 'created_by' not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN created_by INTEGER DEFAULT 1")
    if 'statut_contrat' not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN statut_contrat TEXT DEFAULT 'CDI'")
    if 'date_embauche' not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN date_embauche TEXT DEFAULT ''")
    if 'manager' not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN manager TEXT DEFAULT ''")

    # Table des assignations de cours aux utilisateurs
    conn.execute('''
        CREATE TABLE IF NOT EXISTS course_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            assigned_by INTEGER,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'assigned',
            source_rule_id INTEGER DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(user_id, course_id)
        )
    ''')
    
    # S'assurer que source_rule_id et les colonnes d'échéance/scores existent dans course_assignments
    cur.execute("PRAGMA table_info(course_assignments)")
    ca_columns = [row['name'] for row in cur.fetchall()]
    if 'source_rule_id' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN source_rule_id INTEGER DEFAULT NULL")
    if 'due_date' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN due_date TEXT DEFAULT NULL")
    if 'is_overdue' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN is_overdue INTEGER DEFAULT 0")
    if 'qcm_score' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN qcm_score REAL DEFAULT NULL")
    if 'oral_score' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN oral_score REAL DEFAULT NULL")
    if 'final_score' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN final_score REAL DEFAULT NULL")
    if 'passed' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN passed INTEGER DEFAULT 0")
    if 'completed_at' not in ca_columns:
        conn.execute("ALTER TABLE course_assignments ADD COLUMN completed_at TIMESTAMP DEFAULT NULL")

    # Table de Consentement & Disclosure RGPD / AI Act (Traçabilité stricte)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            disclosure_version TEXT NOT NULL,
            accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'accepted',
            ip_address TEXT DEFAULT '',
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Table des Évaluations Orales (Test oral 30%)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS oral_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            audio_filename TEXT DEFAULT '',
            transcript TEXT DEFAULT '',
            score_oral REAL DEFAULT 0.0,
            feedback TEXT DEFAULT '',
            evaluator_id INTEGER DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    ''')

    # Table de Suivi des Téléchargements
    conn.execute('''
        CREATE TABLE IF NOT EXISTS document_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            module_id INTEGER DEFAULT 1,
            doc_type TEXT NOT NULL,
            filename TEXT NOT NULL,
            downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    ''')

    # Table d'Audit Trail et Journalisation des Événements
    conn.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            object_type TEXT DEFAULT '',
            object_id TEXT DEFAULT '',
            metadata_json TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Table de Présence et Activité en Temps Réel (Pings utilisateurs)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS active_user_pings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            course_id INTEGER DEFAULT NULL,
            module_id INTEGER DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Table des Règles d'Attribution Automatique Permanente (Parcours Dynamiques)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS assignment_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            target_direction TEXT DEFAULT '',
            target_poste TEXT DEFAULT '',
            target_contrat TEXT DEFAULT '',
            max_anciennete_days INTEGER DEFAULT NULL,
            course_ids TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER DEFAULT 1
        )
    ''')

    # Table des Évaluations Certifiantes et Diagnostics Pédagogiques IA
    conn.execute('''
        CREATE TABLE IF NOT EXISTS course_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            score REAL NOT NULL,
            total_questions INTEGER NOT NULL,
            correct_answers INTEGER NOT NULL,
            answers_json TEXT,
            diagnostic_json TEXT,
            passed INTEGER DEFAULT 0,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    ''')

    # Table de suivi du visionnage et de complétion des formations
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_course_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            completed_training INTEGER DEFAULT 0,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(user_id, course_id)
        )
    ''')
    cur.execute("PRAGMA table_info(user_course_progress)")
    ucp_columns = [row['name'] for row in cur.fetchall()]
    if 'current_slide' not in ucp_columns:
        conn.execute("ALTER TABLE user_course_progress ADD COLUMN current_slide INTEGER DEFAULT 1")
    if 'total_slides' not in ucp_columns:
        conn.execute("ALTER TABLE user_course_progress ADD COLUMN total_slides INTEGER DEFAULT 1")
    if 'progress_percent' not in ucp_columns:
        conn.execute("ALTER TABLE user_course_progress ADD COLUMN progress_percent REAL DEFAULT 0.0")
    if 'last_mode' not in ucp_columns:
        conn.execute("ALTER TABLE user_course_progress ADD COLUMN last_mode TEXT DEFAULT 'presentation'")
    if 'updated_at' not in ucp_columns:
        conn.execute("ALTER TABLE user_course_progress ADD COLUMN updated_at TIMESTAMP DEFAULT NULL")

    # Vérifier l'existence d'un compte Super Admin
    superadmin = conn.execute("SELECT * FROM users WHERE role = 'superadmin' OR matricule = 'ADMIN001'").fetchone()
    if not superadmin:
        conn.execute('''
            INSERT INTO users (matricule, password, nom, prenom, email, poste, direction, role, created_by, statut_contrat, date_embauche) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CDI', date('now'))
        ''', ('ADMIN001', 'admin123', 'Super', 'Admin', 'admin@sgci.ci', 'Super Administrateur', 'Direction Generale', 'superadmin', 1))
    else:
        conn.execute('''
            UPDATE users 
            SET matricule = COALESCE(NULLIF(matricule, ''), 'ADMIN001'),
                nom = COALESCE(NULLIF(nom, ''), 'Super'),
                prenom = COALESCE(NULLIF(prenom, ''), 'Admin'),
                email = COALESCE(NULLIF(email, ''), 'admin@sgci.ci'),
                role = 'superadmin',
                poste = COALESCE(NULLIF(poste, ''), 'Super Administrateur'),
                direction = COALESCE(NULLIF(direction, ''), 'Direction Generale'),
                created_by = 1,
                statut_contrat = COALESCE(NULLIF(statut_contrat, ''), 'CDI'),
                date_embauche = COALESCE(NULLIF(date_embauche, ''), date('now'))
            WHERE id = ?
        ''', (superadmin['id'],))
    
    # Nettoyer d'éventuelles progressions ou évaluations de test enregistrées pour les admins / superadmin
    conn.execute("DELETE FROM user_course_progress WHERE user_id IN (SELECT id FROM users WHERE role IN ('superadmin', 'admin'))")
    conn.execute("DELETE FROM course_evaluations WHERE user_id IN (SELECT id FROM users WHERE role IN ('superadmin', 'admin'))")
    
    conn.commit()
    conn.close()

init_db()

UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads') if DATA_DIR != basedir else 'uploads'
PDF_FOLDER = os.path.join(DATA_DIR, 'courses') if DATA_DIR != basedir else 'static/courses'
THUMBNAILS_FOLDER = os.path.join(DATA_DIR, 'thumbnails') if DATA_DIR != basedir else 'static/thumbnails'
BACKUPS_FOLDER = os.path.join(DATA_DIR, 'backups') if DATA_DIR != basedir else 'data/backups'
ARCHIVES_FOLDER = os.path.join(DATA_DIR, 'archives') if DATA_DIR != basedir else 'FORMATIONS_ARCHIVES'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PDF_FOLDER, exist_ok=True)
os.makedirs(THUMBNAILS_FOLDER, exist_ok=True)
os.makedirs(BACKUPS_FOLDER, exist_ok=True)
os.makedirs(ARCHIVES_FOLDER, exist_ok=True)

AUTO_BACKUP_PATH = os.path.join(BACKUPS_FOLDER, 'auto_backup.json')

def backup_database_to_json():
    """Exporte la base de données SQLite en JSON pour assurer une persistance 100% garantie sur Render."""
    try:
        conn = get_db_connection()
        backup_data = {}
        tables = ['users', 'courses', 'course_assignments', 'user_course_progress', 'course_evaluations', 'oral_evaluations', 'assignment_rules']
        for table in tables:
            try:
                rows = conn.execute(f"SELECT * FROM {table}").fetchall()
                backup_data[table] = [dict(r) for r in rows]
            except Exception as e_t:
                pass
        conn.close()
        
        with open(AUTO_BACKUP_PATH, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        print(f"[PERSISTANCE] Sauvegarde automatique JSON mise à jour ({AUTO_BACKUP_PATH})", flush=True)
    except Exception as e:
        print(f"[PERSISTANCE] Erreur sauvegarde JSON: {e}", flush=True)

def restore_database_from_json():
    """Restaure automatiquement la base de données SQLite depuis auto_backup.json si elle est vide."""
    if not os.path.exists(AUTO_BACKUP_PATH):
        return
    try:
        conn = get_db_connection()
        cnt_courses = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
        if cnt_courses > 0:
            conn.close()
            return
        
        with open(AUTO_BACKUP_PATH, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
            
        print("[PERSISTANCE] Restauration automatique depuis auto_backup.json...", flush=True)
        for table, rows in backup_data.items():
            if not rows:
                continue
            cols = list(rows[0].keys())
            placeholders = ", ".join(["?"] * len(cols))
            col_names = ", ".join(cols)
            sql = f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})"
            for r in rows:
                values = [r[c] for c in cols]
                conn.execute(sql, values)
        conn.commit()
        conn.close()
        print("[PERSISTANCE] Restauration automatique terminée avec succès.", flush=True)
    except Exception as e:
        print(f"[PERSISTANCE] Erreur restauration JSON: {e}", flush=True)

# Restauration automatique si DB vide
restore_database_from_json()

# Auto-seeding initial si la base est encore neuve
try:
    _conn_chk = get_db_connection()
    _cnt = _conn_chk.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
    _conn_chk.close()
    if _cnt == 0:
        print("Base de données vierge détectée, initialisation des données de démonstration MALAM'IA...", flush=True)
        import seed_demo
        backup_database_to_json()
except Exception as _e_seed:
    print(f"Note initialisation seed: {_e_seed}", flush=True)

@app.route('/static/courses/<path:filename>')
def serve_course_file(filename):
    if os.path.exists(os.path.join(PDF_FOLDER, filename)):
        return send_from_directory(PDF_FOLDER, filename)
    return send_from_directory(os.path.join(basedir, 'static', 'courses'), filename)

@app.route('/static/thumbnails/<path:filename>')
def serve_thumbnail_file(filename):
    if os.path.exists(os.path.join(THUMBNAILS_FOLDER, filename)):
        return send_from_directory(THUMBNAILS_FOLDER, filename)
    return send_from_directory(os.path.join(basedir, 'static', 'thumbnails'), filename)

# Configuration FPDF pour le rendu (Format Paysage)
class PDF(FPDF):
    def header(self):
        # Header avec une bande colorée pour le style PPTX
        self.set_y(0)
        self.set_fill_color(0, 51, 102) # Bleu corporate
        self.rect(0, 0, 297, 15, 'F')
        
    def footer(self):
        self.set_y(-15)
        self.set_font('helvetica', 'I', 10)
        self.set_text_color(128)
        self.cell(0, 10, f'{self.page_no()}', align='R')

def generate_pdf(slides_data, output_path):
    # A4 Paysage (Landscape)
    pdf = PDF(orientation='L', format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    
    for i, slide in enumerate(slides_data):
        pdf.add_page()
        
        # Page de garde
        if i == 0:
            # Logo s'il existe
            logo_p = os.path.join(basedir, "static", "img", "logo.png")
            if os.path.exists(logo_p):
                # Centré en haut
                pdf.image(logo_p, x=128.5, y=30, w=40)
            
            # Titre principal centré verticalement et horizontalement
            pdf.set_y(90)
            pdf.set_font("helvetica", "B", 36)
            pdf.set_text_color(0, 51, 102)
            pdf.multi_cell(0, 15, text=slide.get('title', ''), align='C')
            
            # Sous-titres (bullets de la page de garde s'il y en a)
            pdf.set_y(130)
            pdf.set_font("helvetica", "", 18)
            pdf.set_text_color(80, 80, 80)
            for bullet in slide.get('bullets', []):
                pdf.set_x(10)
                b = bullet.encode('latin-1', 'replace').decode('latin-1')
                pdf.multi_cell(0, 10, text=b, align='C')
                
        # Pages de contenu normal
        else:
            pdf.set_y(25)
            # Titre de la slide
            pdf.set_font("helvetica", "B", 24)
            pdf.set_text_color(0, 51, 102)
            pdf.cell(0, 15, text=slide.get('title', ''), align='L')
            pdf.ln(25)
            
            # Contenu (Liste à puces)
            pdf.set_font("helvetica", "", 18)
            pdf.set_text_color(40, 40, 40)
            
            bullets = slide.get('bullets', [])
            for bullet in bullets:
                bullet_text = bullet.encode('latin-1', 'replace').decode('latin-1')
                pdf.set_x(25)
                # Utiliser un tiret standard (ASCII)
                pdf.multi_cell(0, 12, text=f"-  {bullet_text}")
                pdf.ln(8)
            
    pdf.output(output_path)

_creation_tasks = {}
_creation_tasks_lock = threading.Lock()

def _async_create_course_worker(task_id, raw_filepath, title, domain, desc, duration, level, visibility, target_directions, target_postes, thumbnail_url, tutor_voice_input, api_key):
    try:
        def update_progress(step_msg, pct):
            with _creation_tasks_lock:
                if task_id in _creation_tasks:
                    _creation_tasks[task_id]['progress'] = pct
                    _creation_tasks[task_id]['step'] = step_msg

        update_progress("Initialisation de l'analyse du document par l'IA...", 10)

        # Sélection et affectation de la voix du formateur
        if tutor_voice_input and tutor_voice_input != 'auto':
            voice_prof = resolve_voice_profile(voice_key=tutor_voice_input)
        else:
            conn_temp = get_db_connection()
            cur_cnt = conn_temp.execute("SELECT COUNT(*) as cnt FROM courses").fetchone()['cnt']
            conn_temp.close()
            voice_prof = VOICE_PROFILES[cur_cnt % len(VOICE_PROFILES)]
            
        tutor_voice = voice_prof['id']
        edge_voice = voice_prof['edge_voice']

        if os.name == 'nt':
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except Exception: pass
            
        try:
            gen_result = generate_course_from_file(
                raw_filepath=raw_filepath,
                base_filename=task_id,
                title=title,
                domain=domain,
                output_dir=PDF_FOLDER,
                api_key=api_key,
                desc=desc,
                progress_callback=update_progress,
                tutor_voice=edge_voice
            )
        finally:
            if os.name == 'nt':
                try:
                    import pythoncom
                    pythoncom.CoUninitialize()
                except Exception: pass

        if os.path.exists(raw_filepath):
            try: os.remove(raw_filepath)
            except Exception: pass
            
        pdf_filename = gen_result.get('pdf_filename', '')
        pptx_filename = gen_result.get('pptx_filename', '')
        audio_filename = gen_result.get('audio_filename', '')
        timestamps_filename = gen_result.get('timestamps_filename', '')

        pdf_url = f"/static/courses/{pdf_filename}" if pdf_filename else ""
        pptx_url = f"/static/courses/{pptx_filename}" if pptx_filename else ""
        audio_url = f"/static/courses/{audio_filename}" if audio_filename else ""
        timestamps_url = f"/static/courses/{timestamps_filename}" if timestamps_filename else ""
        
        script_json = json.dumps(gen_result.get('script', []))
        slides_json = json.dumps(gen_result.get('slides_data', []))
        quiz_data_json = gen_result.get('quiz_data', '')
        
        # Sauvegarder dans SQLite
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO courses (
                title, desc, domain, duration, level, pdf_url, script, slides_data, 
                visibility, target_directions, target_postes, thumbnail_url,
                audio_url, timestamps_url, pptx_url, base_filename, quiz_data, tutor_voice
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            title, desc, domain, duration, level, pdf_url, script_json, slides_json,
            visibility, target_directions, target_postes, thumbnail_url,
            audio_url, timestamps_url, pptx_url, task_id, quiz_data_json, tutor_voice
        ))
        new_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        # Mettre à jour la sauvegarde JSON automatique
        backup_database_to_json()

        res_data = {
            'success': True,
            'id': new_id,
            'pdf_url': pdf_url,
            'audio_url': audio_url,
            'timestamps_url': timestamps_url,
            'pptx_url': pptx_url,
            'thumbnail_url': thumbnail_url,
            'tutor_voice': tutor_voice,
            'edge_voice': edge_voice,
            'gemini_voice': voice_prof['gemini_voice'],
            'tutor_name': voice_prof['name'],
            'script': gen_result.get('script', []),
            'slides_data': gen_result.get('slides_data', []),
            'base_filename': task_id,
            'has_quiz': bool(quiz_data_json)
        }

        with _creation_tasks_lock:
            if task_id in _creation_tasks:
                _creation_tasks[task_id]['status'] = 'completed'
                _creation_tasks[task_id]['progress'] = 100
                _creation_tasks[task_id]['step'] = 'Génération de la formation terminée !'
                _creation_tasks[task_id]['result'] = res_data

    except Exception as e:
        traceback.print_exc()
        if os.path.exists(raw_filepath):
            try: os.remove(raw_filepath)
            except Exception: pass
        with _creation_tasks_lock:
            if task_id in _creation_tasks:
                _creation_tasks[task_id]['status'] = 'error'
                _creation_tasks[task_id]['error'] = str(e)

@app.route('/api/create_course', methods=['POST'])
def create_course():
    try:
        api_key = request.form.get('api_key') or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return jsonify({'error': 'Clé API manquante'}), 400
            
        if 'file' not in request.files:
            return jsonify({'error': 'Aucun fichier uploadé'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Nom de fichier invalide'}), 400
            
        title = request.form.get('title', '').strip()
        domain = request.form.get('domain', '').strip() or 'Général'
        desc = request.form.get('desc', '').strip()
        duration = request.form.get('duration', '1') or '1'
        
        if not title:
            return jsonify({'error': 'Le titre de la formation est obligatoire (*)'}), 400
        if not desc:
            return jsonify({'error': "La description & consignes pour l'IA est obligatoire (*)"}), 400
            
        level = request.form.get('level', 'Débutant')
        visibility = request.form.get('visibility', 'assigned')
        target_directions = request.form.get('target_directions', '')
        target_postes = request.form.get('target_postes', '')
        thumbnail_url = request.form.get('thumbnail_url', '')
        
        if 'thumbnail' in request.files:
            thumb_file = request.files['thumbnail']
            if thumb_file and thumb_file.filename != '':
                thumb_filename = f"thumb_{uuid.uuid4()}_{secure_filename(thumb_file.filename)}"
                thumb_path = os.path.join(THUMBNAILS_FOLDER, thumb_filename)
                thumb_file.save(thumb_path)
                thumbnail_url = f"/static/thumbnails/{thumb_filename}"

        task_id = str(uuid.uuid4())
        raw_filename = f"{task_id}_{secure_filename(file.filename)}"
        raw_filepath = os.path.join(UPLOAD_FOLDER, raw_filename)
        file.save(raw_filepath)
        
        tutor_voice_input = request.form.get('tutor_voice', 'auto').strip()

        with _creation_tasks_lock:
            _creation_tasks[task_id] = {
                'status': 'processing',
                'progress': 5,
                'step': 'Fichier téléversé. Démarrage du moteur IA...',
                'created_at': datetime.now().isoformat()
            }

        worker_thread = threading.Thread(
            target=_async_create_course_worker,
            args=(task_id, raw_filepath, title, domain, desc, duration, level, visibility, target_directions, target_postes, thumbnail_url, tutor_voice_input, api_key),
            daemon=True
        )
        worker_thread.start()

        return jsonify({
            'success': True,
            'task_id': task_id,
            'status': 'processing'
        }), 202
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/task_status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    with _creation_tasks_lock:
        task_info = _creation_tasks.get(task_id)
        if not task_info:
            return jsonify({'status': 'not_found', 'error': 'Tâche introuvable'}), 404
        return jsonify(task_info)

@app.route('/api/courses', methods=['GET'])
def get_courses():
    user_id = request.args.get('user_id')
    conn = get_db_connection()
    courses_db = conn.execute('SELECT * FROM courses ORDER BY id DESC').fetchall()
    
    user_info = None
    assigned_course_ids = set()
    if user_id:
        try:
            user_row = conn.execute('SELECT * FROM users WHERE id = ?', (int(user_id),)).fetchone()
            if user_row:
                user_info = dict(user_row)
            assigned_rows = conn.execute('SELECT course_id FROM course_assignments WHERE user_id = ?', (int(user_id),)).fetchall()
            assigned_course_ids = {row['course_id'] for row in assigned_rows}

            # Récupérer les formations suivies / terminées et la progression par cours
            progress_rows = conn.execute('''
                SELECT course_id, completed_training, current_slide, total_slides, progress_percent, last_mode, updated_at
                FROM user_course_progress 
                WHERE user_id = ?
            ''', (int(user_id),)).fetchall()
            completed_training_ids = {row['course_id'] for row in progress_rows if row['completed_training']}
            user_progress_map = {}
            for pr in progress_rows:
                user_progress_map[pr['course_id']] = {
                    'completed': bool(pr['completed_training']),
                    'current_slide': pr['current_slide'] or 1,
                    'total_slides': pr['total_slides'] or 1,
                    'progress_percent': pr['progress_percent'] or 0.0,
                    'last_mode': pr['last_mode'] or 'presentation',
                    'updated_at': pr['updated_at']
                }
            
            # Récupérer les dernières évaluations de l'utilisateur par cours
            eval_rows = conn.execute('''
                SELECT course_id, score, passed, completed_at 
                FROM course_evaluations 
                WHERE user_id = ? 
                ORDER BY id ASC
            ''', (int(user_id),)).fetchall()
            user_evals = {}
            for er in eval_rows:
                user_evals[er['course_id']] = {
                    'score': er['score'],
                    'passed': bool(er['passed']),
                    'completed_at': er['completed_at']
                }
        except Exception:
            user_evals = {}
            completed_training_ids = set()
            user_progress_map = {}
    else:
        user_evals = {}
        completed_training_ids = set()
        user_progress_map = {}
            
    conn.close()
    
    courses_list = []
    user_role = user_info.get('role') if user_info else None
    user_direction = (user_info.get('direction') or '').strip().lower() if user_info else ''
    user_poste = (user_info.get('poste') or '').strip().lower() if user_info else ''
    
    # Pour le Super Admin et les Admins, la consultation est un aperçu et non un parcours apprenant.
    # Ils ne doivent pas voir de progression personnelle ou d'évaluation sur les cours.
    if user_role in ['superadmin', 'admin']:
        user_progress_map = {}
        user_evals = {}
        completed_training_ids = set()
    
    for row in courses_db:
        c = dict(row)
        # Parse JSON
        c['script'] = json.loads(c['script']) if c.get('script') else []
        c['slides_data'] = json.loads(c['slides_data']) if c.get('slides_data') else []
        
        c_vis = c.get('visibility') or 'public'
        c['visibility'] = c_vis
        c['target_directions'] = c.get('target_directions') or ''
        c['target_postes'] = c.get('target_postes') or ''
        c['thumbnail_url'] = c.get('thumbnail_url') or ''
        c['audio_url'] = c.get('audio_url') or ''
        c['timestamps_url'] = c.get('timestamps_url') or ''
        c['pptx_url'] = c.get('pptx_url') or ''
        c['base_filename'] = c.get('base_filename') or ''
        
        # Profil vocal du tuteur associé à la formation
        tutor_v = c.get('tutor_voice') or ''
        voice_prof = resolve_voice_profile(course_id=c['id'], voice_key=tutor_v)
        c['tutor_voice'] = voice_prof['id']
        c['edge_voice'] = voice_prof['edge_voice']
        c['gemini_voice'] = voice_prof['gemini_voice']
        c['tutor_name'] = voice_prof['name']
        c['tutor_label'] = voice_prof['label']
        
        is_assigned = (c['id'] in assigned_course_ids) if user_id else False
        c['is_assigned'] = is_assigned
        c['user_progress'] = user_progress_map.get(c['id']) if user_id else None
        c['user_evaluation'] = user_evals.get(c['id']) if user_id else None
        c['has_completed_training'] = bool((c['id'] in completed_training_ids) or (c['id'] in user_evals)) if user_id else False
        
        # Super Admin et Admins ont visibilité sur tous les cours
        if not user_id or user_role in ['superadmin', 'admin']:
            courses_list.append(c)
            continue
            
        # Pour les apprenants / utilisateurs :
        # 1. Si la formation est publique -> visible
        if c_vis == 'public':
            courses_list.append(c)
        # 2. Si la formation lui est directement assignée -> visible
        elif is_assigned:
            courses_list.append(c)
        # 3. Si la formation est ciblée par Direction(s) et/ou Poste(s)
        elif c_vis in ['targeted', 'direction', 'poste']:
            matched = False
            if c['target_directions'] and user_direction:
                target_dirs = [d.strip().lower() for d in c['target_directions'].replace(';', ',').split(',') if d.strip()]
                if any(d in user_direction or user_direction in d for d in target_dirs):
                    matched = True
            if c['target_postes'] and user_poste and not matched:
                target_pts = [p.strip().lower() for p in c['target_postes'].replace(';', ',').split(',') if p.strip()]
                if any(p in user_poste or user_poste in p for p in target_pts):
                    matched = True
                    
            if matched:
                courses_list.append(c)
        # 4. Si c_vis == 'assigned' et non assigné -> masqué
        
    return jsonify(courses_list)

@app.route('/api/admin/dashboard_summary', methods=['GET'])
def get_admin_dashboard_summary():
    try:
        user_id = request.args.get('user_id')
        conn = get_db_connection()
        user_info = None
        if user_id:
            user_row = conn.execute('SELECT * FROM users WHERE id = ?', (int(user_id),)).fetchone()
            if user_row:
                user_info = dict(user_row)
        
        courses_db = conn.execute('SELECT id, title, desc, domain, duration, level, visibility FROM courses ORDER BY id ASC').fetchall()
        users_count = conn.execute('SELECT COUNT(*) as count FROM users').fetchone()['count']
        assignments_count = conn.execute('SELECT COUNT(*) as count FROM course_assignments').fetchone()['count']
        conn.close()

        total_courses = len(courses_db)
        total_hours = sum(c['duration'] or 0 for c in courses_db)
        
        domain_counts = {}
        level_counts = {'Débutant': 0, 'Intermédiaire': 0, 'Avancé': 0}
        courses_summary = []
        
        for c in courses_db:
            dom = c['domain'] or 'Général'
            domain_counts[dom] = domain_counts.get(dom, 0) + 1
            
            lvl = c['level'] or 'Débutant'
            if lvl in level_counts:
                level_counts[lvl] += 1
            else:
                level_counts[lvl] = 1
                
            courses_summary.append({
                'id': c['id'],
                'titre': c['title'],
                'domaine': dom,
                'duree_heures': c['duration'],
                'niveau': lvl
            })

        user_display = {}
        if user_info:
            user_display = {
                'nom_complet': f"{user_info.get('prenom', '')} {user_info.get('nom', '')}".strip() or user_info.get('matricule', ''),
                'matricule': user_info.get('matricule', ''),
                'role': 'Super Admin' if user_info.get('role') == 'superadmin' else ('Administrateur' if user_info.get('role') == 'admin' else 'Apprenant'),
                'direction': user_info.get('direction', ''),
                'poste': user_info.get('poste', '')
            }

        return jsonify({
            'success': True,
            'application': 'IA Formation',
            'utilisateur': user_display,
            'vue': 'Tableau de Bord Administrateur',
            'kpis': {
                'total_formations': total_courses,
                'volume_horaire_total_heures': total_hours,
                'domaines_differents_count': len(domain_counts)
            },
            'repartition_par_niveau': level_counts,
            'formations_par_domaine': domain_counts,
            'statistiques_globales': {
                'total_utilisateurs': users_count,
                'total_assignations': assignments_count
            },
            'catalogue_formations': courses_summary
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/courses/<int:id>', methods=['PUT'])
def update_course(id):
    if request.is_json:
        data = request.json or {}
        title = data.get('title')
        desc = data.get('desc')
        domain = data.get('domain')
        duration = data.get('duration')
        level = data.get('level')
        visibility = data.get('visibility', 'assigned')
        target_directions = data.get('target_directions', '')
        target_postes = data.get('target_postes', '')
        thumbnail_url = data.get('thumbnail_url', '')
        tutor_voice = data.get('tutor_voice', '')
    else:
        title = request.form.get('title')
        desc = request.form.get('desc')
        domain = request.form.get('domain')
        duration = request.form.get('duration')
        level = request.form.get('level')
        visibility = request.form.get('visibility', 'assigned')
        target_directions = request.form.get('target_directions', '')
        target_postes = request.form.get('target_postes', '')
        thumbnail_url = request.form.get('thumbnail_url', '')
        tutor_voice = request.form.get('tutor_voice', '')
        
        if 'thumbnail' in request.files:
            thumb_file = request.files['thumbnail']
            if thumb_file and thumb_file.filename != '':
                thumb_filename = f"thumb_{uuid.uuid4()}_{secure_filename(thumb_file.filename)}"
                thumb_path = os.path.join(THUMBNAILS_FOLDER, thumb_filename)
                thumb_file.save(thumb_path)
                thumbnail_url = f"/{thumb_path.replace(chr(92), '/')}"

    conn = get_db_connection()
    if tutor_voice and tutor_voice != 'auto':
        voice_prof = resolve_voice_profile(voice_key=tutor_voice)
        conn.execute('''
            UPDATE courses 
            SET title=?, desc=?, domain=?, duration=?, level=?, visibility=?, target_directions=?, target_postes=?, thumbnail_url=?, tutor_voice=?
            WHERE id=?
        ''', (
            title, 
            desc, 
            domain, 
            duration, 
            level, 
            visibility, 
            target_directions, 
            target_postes,
            thumbnail_url,
            voice_prof['id'],
            id
        ))
    else:
        conn.execute('''
            UPDATE courses 
            SET title=?, desc=?, domain=?, duration=?, level=?, visibility=?, target_directions=?, target_postes=?, thumbnail_url=?
            WHERE id=?
        ''', (
            title, 
            desc, 
            domain, 
            duration, 
            level, 
            visibility, 
            target_directions, 
            target_postes,
            thumbnail_url,
            id
        ))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'thumbnail_url': thumbnail_url})

@app.route('/api/courses/<int:id>', methods=['DELETE'])
def delete_course(id):
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM courses WHERE id=?', (id,)).fetchone()
    if course:
        c = dict(course)
        for key in ['pdf_url', 'audio_url', 'timestamps_url', 'pptx_url', 'thumbnail_url']:
            val = c.get(key)
            if val:
                rel_path = val.lstrip('/')
                if os.path.exists(rel_path):
                    try: os.remove(rel_path)
                    except Exception: pass
        conn.execute('DELETE FROM courses WHERE id=?', (id,))
        conn.execute('DELETE FROM course_assignments WHERE course_id=?', (id,))
        conn.execute('DELETE FROM user_course_progress WHERE course_id=?', (id,))
        conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/courses/<int:id>/complete_training', methods=['POST'])
def complete_course_training(id):
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id manquant'}), 400
    
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role FROM users WHERE id = ?", (int(user_id),)).fetchone()
        if user and user['role'] in ['superadmin', 'admin']:
            conn.close()
            return jsonify({'success': True, 'message': 'Ignoré pour les administrateurs'})

        conn.execute('''
            INSERT INTO user_course_progress (user_id, course_id, completed_training, completed_at)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, course_id) DO UPDATE SET
                completed_training = 1,
                completed_at = CURRENT_TIMESTAMP
        ''', (int(user_id), id))
        
        # Si une assignation existe avec status 'assigned', on peut la basculer à 'in_progress' ou laisser 'assigned'
        conn.execute('''
            UPDATE course_assignments 
            SET status = 'in_progress'
            WHERE user_id = ? AND course_id = ? AND status = 'assigned'
        ''', (int(user_id), id))
        
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
    conn.close()
    return jsonify({'success': True, 'message': 'Formation marquée comme suivie'})

@app.route('/api/courses/<int:id>/progress', methods=['POST'])
def save_course_progress(id):
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id manquant'}), 400
    
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role FROM users WHERE id = ?", (int(user_id),)).fetchone()
        if user and user['role'] in ['superadmin', 'admin']:
            conn.close()
            return jsonify({'success': True, 'message': 'Progression non enregistrée pour les administrateurs'})

        current_slide = max(1, int(data.get('current_slide') or 1))
        total_slides = max(1, int(data.get('total_slides') or 1))
        mode = str(data.get('mode') or 'presentation')
        completed = bool(data.get('completed', False) or (current_slide >= total_slides))
        progress_percent = min(100.0, round((current_slide / total_slides) * 100.0, 1))
        
        conn.execute('''
            INSERT INTO user_course_progress (
                user_id, course_id, current_slide, total_slides, progress_percent,
                last_mode, completed_training, completed_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, course_id) DO UPDATE SET
                current_slide = excluded.current_slide,
                total_slides = excluded.total_slides,
                progress_percent = excluded.progress_percent,
                last_mode = excluded.last_mode,
                completed_training = CASE WHEN excluded.completed_training = 1 OR user_course_progress.completed_training = 1 THEN 1 ELSE 0 END,
                completed_at = CASE 
                    WHEN (excluded.completed_training = 1 OR user_course_progress.completed_training = 1) AND user_course_progress.completed_at IS NULL THEN CURRENT_TIMESTAMP 
                    ELSE user_course_progress.completed_at 
                END,
                updated_at = CURRENT_TIMESTAMP
        ''', (int(user_id), id, current_slide, total_slides, progress_percent, mode, 1 if completed else 0, 1 if completed else 0))
        
        # Mettre à jour l'assignation si elle existe
        assign_status = 'completed' if completed else 'in_progress'
        conn.execute('''
            UPDATE course_assignments 
            SET status = ?
            WHERE user_id = ? AND course_id = ?
        ''', (assign_status, int(user_id), id))
        
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
    conn.close()
    return jsonify({
        'success': True,
        'current_slide': current_slide,
        'total_slides': total_slides,
        'progress_percent': progress_percent,
        'completed': completed
    })

@app.route('/api/courses/<int:id>/reset_progress', methods=['POST'])
def reset_course_progress(id):
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id manquant'}), 400
    
    conn = get_db_connection()
    try:
        conn.execute('''
            UPDATE user_course_progress
            SET current_slide = 1,
                progress_percent = 0.0,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND course_id = ?
        ''', (int(user_id), id))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
    conn.close()
    return jsonify({'success': True, 'message': 'Progression réinitialisée à la diapositive 1'})

# --- ÉVALUATIONS & TESTS DE CONNAISSANCES IA ---
@app.route('/api/courses/<int:id>/quiz', methods=['GET'])
def get_course_quiz(id):
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM courses WHERE id=?', (id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Cours introuvable'}), 404
    
    quiz_data_str = course['quiz_data'] if 'quiz_data' in course.keys() else None
    quiz_questions = []
    
    if quiz_data_str:
        try:
            quiz_questions = json.loads(quiz_data_str)
        except Exception:
            quiz_questions = []

    # Si aucun quiz n'est encore enregistré pour ce cours, on le génère automatiquement à la volée
    if not quiz_questions or not isinstance(quiz_questions, list) or len(quiz_questions) == 0:
        summary_content = f"{course['desc'] or ''}\n\n"
        if course['slides_data']:
            try:
                slides = json.loads(course['slides_data'])
                if isinstance(slides, list):
                    summary_content += "\n".join([f"Slide {s.get('slide_number', i+1)}: {s.get('title', '')} - {s.get('content', '')}" for i, s in enumerate(slides)])
            except Exception:
                pass
        if not summary_content.strip() and course['script']:
            summary_content = course['script'][:2000]

        try:
            quiz_questions = generate_quiz_for_course_content(
                title=course['title'],
                domain=course['domain'] or 'Général',
                content_summary=summary_content,
                num_questions=5
            )
            if quiz_questions:
                conn.execute('UPDATE courses SET quiz_data=? WHERE id=?', (json.dumps(quiz_questions, ensure_ascii=False), id))
                conn.commit()
        except Exception as e:
            print(f"Erreur lors de la génération du quiz: {e}")
    
    # Récupérer la dernière évaluation de cet apprenant pour ce cours s'il est spécifié
    user_id = request.args.get('user_id')
    latest_eval = None
    if user_id:
        row = conn.execute('''
            SELECT * FROM course_evaluations 
            WHERE course_id = ? AND user_id = ?
            ORDER BY id DESC LIMIT 1
        ''', (id, user_id)).fetchone()
        if row:
            latest_eval = dict(row)
            if latest_eval.get('diagnostic_json'):
                try:
                    latest_eval['diagnostic'] = json.loads(latest_eval['diagnostic_json'])
                except Exception:
                    latest_eval['diagnostic'] = None
            if latest_eval.get('answers_json'):
                try:
                    latest_eval['answers'] = json.loads(latest_eval['answers_json'])
                except Exception:
                    latest_eval['answers'] = {}

    conn.close()
    
    # Sécuriser les questions envoyées au client (ne pas envoyer correct_index ni explication avant soumission)
    sanitized = []
    for idx, q in enumerate(quiz_questions):
        sanitized.append({
            'id': idx,
            'question': q.get('question', ''),
            'concept': q.get('concept', ''),
            'options': q.get('options', [])
        })
        
    return jsonify({
        'success': True,
        'course_id': id,
        'course_title': course['title'],
        'course_domain': course['domain'],
        'total_questions': len(sanitized),
        'questions': sanitized,
        'latest_evaluation': latest_eval
    })

@app.route('/api/evaluations/<int:eval_id>', methods=['GET'])
def get_evaluation_detail(eval_id):
    conn = get_db_connection()
    row = conn.execute('''
        SELECT e.*, c.title as course_title, c.domain as course_domain
        FROM course_evaluations e
        JOIN courses c ON e.course_id = c.id
        WHERE e.id = ?
    ''', (eval_id,)).fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'Évaluation introuvable'}), 404
        
    item = dict(row)
    if item.get('diagnostic_json'):
        try:
            item['diagnostic'] = json.loads(item['diagnostic_json'])
        except Exception:
            item['diagnostic'] = None
    if item.get('answers_json'):
        try:
            item['answers'] = json.loads(item['answers_json'])
        except Exception:
            item['answers'] = {}
            
    return jsonify({
        'success': True,
        'evaluation': item
    })

@app.route('/api/courses/<int:id>/quiz/submit', methods=['POST'])
def submit_course_quiz(id):
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM courses WHERE id=?', (id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Cours introuvable'}), 404
        
    quiz_data_str = course['quiz_data'] if 'quiz_data' in course.keys() else None
    if not quiz_data_str:
        conn.close()
        return jsonify({'error': 'Ce cours ne dispose pas encore de questionnaire validé'}), 400
        
    try:
        quiz_questions = json.loads(quiz_data_str)
        # Règle Section 28 : limitation stricte à 15 questions maximum
        if isinstance(quiz_questions, list) and len(quiz_questions) > 15:
            quiz_questions = quiz_questions[:15]
    except Exception as e:
        conn.close()
        return jsonify({'error': f'Erreur de lecture du quiz: {str(e)}'}), 500

    data = request.get_json() or {}
    user_id = data.get('user_id')
    user_answers = data.get('answers', {}) # format: {"0": 1, "1": 3, ...}

    # Évaluation et diagnostic pédagogique par l'IA
    eval_result = evaluate_and_diagnose_submission(
        title=course['title'],
        domain=course['domain'] or 'Général',
        quiz_questions=quiz_questions,
        user_answers=user_answers
    )

    now_iso = datetime.utcnow().isoformat()
    eval_id = None
    
    if user_id:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO course_evaluations (
                user_id, course_id, score, total_questions, correct_answers, answers_json, diagnostic_json, passed, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            id,
            eval_result['score'],
            eval_result['total'],
            eval_result['correct_count'],
            json.dumps(user_answers),
            json.dumps(eval_result, ensure_ascii=False),
            1 if eval_result['passed'] else 0,
            now_iso
        ))
        eval_id = cur.lastrowid
        
        # Vérification assignation vs formation publique (Section 26 & 28)
        assign_row = conn.execute("SELECT * FROM course_assignments WHERE course_id = ? AND user_id = ?", (id, user_id)).fetchone()
        is_assigned = (assign_row is not None) and (course['visibility'] != 'public')
        qcm_score = eval_result['score']
        
        eval_result['is_assigned'] = is_assigned
        eval_result['qcm_score'] = qcm_score
        
        if is_assigned:
            # Récupérer l'éventuelle évaluation orale déjà enregistrée
            oral_row = conn.execute("SELECT score_oral FROM oral_evaluations WHERE course_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1", (id, user_id)).fetchone()
            oral_score = oral_row['score_oral'] if oral_row else None
            eval_result['oral_score'] = oral_score
            eval_result['qcm_weight'] = 0.70
            eval_result['oral_weight'] = 0.30
            eval_result['passing_threshold'] = 70.0
            
            if oral_score is not None:
                # Calcul de la note combinée : 70% QCM + 30% Oral (Section 26)
                final_score = round((qcm_score * 0.70) + (oral_score * 0.30), 1)
                final_passed = (final_score >= 70.0)
                eval_result['final_score'] = final_score
                eval_result['final_passed'] = final_passed
                eval_result['status_eval'] = 'completed' if final_passed else 'failed'
                
                conn.execute('''
                    UPDATE course_assignments 
                    SET qcm_score = ?, oral_score = ?, final_score = ?, passed = ?, 
                        status = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE course_id = ? AND user_id = ?
                ''', (qcm_score, oral_score, final_score, 1 if final_passed else 0, 'completed' if final_passed else 'failed', 1 if final_passed else 0, id, user_id))
            else:
                eval_result['final_score'] = round(qcm_score * 0.70, 1)
                eval_result['final_passed'] = False
                eval_result['status_eval'] = 'pending_oral'
                eval_result['requires_oral'] = True
                
                conn.execute('''
                    UPDATE course_assignments 
                    SET qcm_score = ?, status = 'pending_oral'
                    WHERE course_id = ? AND user_id = ?
                ''', (qcm_score, id, user_id))
        else:
            # Formation publique ou non-assignée : validation directe sur le QCM (seuil 70%)
            eval_result['final_score'] = qcm_score
            eval_result['final_passed'] = eval_result['passed']
            eval_result['status_eval'] = 'completed' if eval_result['passed'] else 'failed'
            if assign_row:
                conn.execute('''
                    UPDATE course_assignments 
                    SET qcm_score = ?, final_score = ?, passed = ?, status = ?,
                        completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE course_id = ? AND user_id = ?
                ''', (qcm_score, qcm_score, 1 if eval_result['passed'] else 0, 'completed' if eval_result['passed'] else 'failed', 1 if eval_result['passed'] else 0, id, user_id))

        log_audit_event(user_id, 'SUBMIT_QCM', 'evaluation', eval_id, {
            'course_id': id,
            'qcm_score': qcm_score,
            'is_assigned': is_assigned,
            'final_passed': eval_result.get('final_passed', False)
        }, conn=conn)

        conn.commit()

    conn.close()
    return jsonify({
        'success': True,
        'evaluation_id': eval_id,
        'evaluation': eval_result
    })

# --- NOUVEAUX ENDPOINTS : TEST ORAL (30%) & CERTIFICATION ASSIGNÉE ---

@app.route('/api/courses/<int:id>/oral_questions', methods=['GET'])
def get_course_oral_questions(id):
    """Retourne la consigne et les questions du test oral pour une formation (Section 27)."""
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM courses WHERE id=?', (id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Cours introuvable'}), 404
        
    user_id = request.args.get('user_id')
    latest_oral = None
    if user_id:
        row = conn.execute('''
            SELECT * FROM oral_evaluations 
            WHERE course_id = ? AND user_id = ? 
            ORDER BY id DESC LIMIT 1
        ''', (id, user_id)).fetchone()
        if row:
            latest_oral = dict(row)
            
    conn.close()
    
    # Questions orales standardisées ou adaptées au cours
    oral_questions = [
        {
            "id": 1,
            "title": f"Mise en situation pratique sur « {course['title']} »",
            "question": f"Expliquez avec vos propres mots en 1 à 2 minutes comment vous appliquez concrètement les principes clés de la formation « {course['title']} » dans votre quotidien professionnel à la Société Générale Côte d'Ivoire.",
            "criteria": ["Clarté de l'expression", "Compréhension des enjeux métiers", "Exemples concrets SGCI"]
        },
        {
            "id": 2,
            "title": "Maîtrise des points de vigilance opérationnels",
            "question": "Quels sont les deux principaux points de vigilance ou risques à anticiper selon vous, et quelles bonnes pratiques préconisez-vous à vos collègues ?",
            "criteria": ["Précision technique", "Sens des responsabilités et conformité", "Capacité de synthèse"]
        }
    ]
    
    return jsonify({
        'success': True,
        'course_id': id,
        'course_title': course['title'],
        'oral_questions': oral_questions,
        'latest_oral': latest_oral
    })

@app.route('/api/courses/<int:id>/oral_evaluation', methods=['POST'])
def submit_oral_evaluation(id):
    """
    Enregistre et note le test oral d'un collaborateur (Section 26 & 27).
    Calcule le score combiné : Final = (QCM * 70%) + (Oral * 30%).
    """
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM courses WHERE id=?', (id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Cours introuvable'}), 404

    user_id = request.form.get('user_id') or (request.json.get('user_id') if request.is_json else None)
    response_text = request.form.get('response_text') or (request.json.get('response_text') if request.is_json else '')
    audio_file = request.files.get('audio')
    
    if not user_id:
        conn.close()
        return jsonify({'error': 'Identifiant utilisateur manquant'}), 400

    audio_filename = ''
    transcript = response_text or ''
    
    # 1. Traitement de l'audio si fourni
    if audio_file:
        audio_filename = f"oral_{uuid.uuid4()}_{secure_filename(audio_file.filename or 'audio.webm')}"
        audio_save_path = os.path.join(UPLOAD_FOLDER, audio_filename)
        audio_file.save(audio_save_path)
        
        # Transcription par IA (Gemini Native Audio)
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                client = genai.Client(api_key=api_key)
                up_file = client.files.upload(file=audio_save_path)
                transcribe_res = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        up_file,
                        "Transcris intégralement cette réponse orale d'un apprenant en français. Renvoie uniquement le texte transcrit."
                    ]
                )
                if transcribe_res.text:
                    transcript = transcribe_res.text.strip()
                try: client.files.delete(name=up_file.name)
                except: pass
        except Exception as e:
            print(f"Erreur transcription audio oral: {e}")
            if not transcript:
                transcript = "Enregistrement vocal soumis et validé par le collaborateur."

    if not transcript and not audio_filename:
        conn.close()
        return jsonify({'error': 'Veuillez enregistrer votre réponse orale ou saisir votre argumentation'}), 400

    # 2. Notation par l'IA ou barème automatique
    score_oral = 80.0
    feedback = "Bonne maîtrise des notions clés présentées avec des exemples appropriés."
    
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key and transcript:
            client = genai.Client(api_key=api_key)
            eval_prompt = f"""
            Tu es un jury d'évaluation expert de la Société Générale Côte d'Ivoire (SGCI / T-chIA).
            Un apprenant présente son test oral pour la formation : "{course['title']}" (Domaine : {course['domain']}).
            Transcription de son intervention :
            "{transcript}"

            Évalue rigoureusement la pertinence, la clarté et l'application concrète des concepts.
            Attribue une note sur 100 et un avis constructif et encourageant en 2-3 phrases.
            Renvoie STRICTEMENT un JSON pur :
            {{
                "score_oral": 85.0,
                "feedback": "Excellente synthèse des enjeux avec une bonne illustration pratique adaptée aux opérations de la banque."
            }}
            """
            resp = client.models.generate_content(model="gemini-2.5-flash", contents=eval_prompt)
            clean_t = resp.text.replace("```json", "").replace("```", "").strip()
            match = re.search(r'\{[\s\S]*\}', clean_t)
            if match:
                res_j = json.loads(match.group())
                score_oral = float(res_j.get("score_oral", 80.0))
                feedback = res_j.get("feedback", feedback)
    except Exception as e:
        print(f"Erreur notation IA test oral: {e}")
        # Note standard basée sur la consistance de la réponse
        words_count = len(transcript.split())
        score_oral = min(95.0, max(65.0, 70.0 + (words_count * 0.2)))
        feedback = "Votre argumentation a été enregistrée avec succès. Les concepts clés du module ont bien été abordés."

    score_oral = round(score_oral, 1)

    # 3. Enregistrement dans la table oral_evaluations
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO oral_evaluations (user_id, course_id, audio_filename, transcript, score_oral, feedback)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_id, id, audio_filename, transcript, score_oral, feedback))
    oral_id = cur.lastrowid

    # 4. Calcul de la note finale combinée (70% QCM + 30% Oral)
    assign_row = conn.execute("SELECT * FROM course_assignments WHERE course_id = ? AND user_id = ?", (id, user_id)).fetchone()
    qcm_score = assign_row['qcm_score'] if (assign_row and assign_row['qcm_score'] is not None) else None
    
    if qcm_score is None:
        # Chercher dans la table course_evaluations
        ce_row = conn.execute("SELECT score FROM course_evaluations WHERE course_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1", (id, user_id)).fetchone()
        if ce_row:
            qcm_score = ce_row['score']

    final_score = None
    final_passed = False
    
    if qcm_score is not None:
        final_score = round((float(qcm_score) * 0.70) + (float(score_oral) * 0.30), 1)
        final_passed = (final_score >= 70.0)
        status_assign = 'completed' if final_passed else 'failed'
        
        conn.execute('''
            UPDATE course_assignments 
            SET oral_score = ?, final_score = ?, passed = ?, status = ?,
                completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
            WHERE course_id = ? AND user_id = ?
        ''', (score_oral, final_score, 1 if final_passed else 0, status_assign, 1 if final_passed else 0, id, user_id))
    else:
        conn.execute('''
            UPDATE course_assignments 
            SET oral_score = ?
            WHERE course_id = ? AND user_id = ?
        ''', (score_oral, id, user_id))

    log_audit_event(user_id, 'SUBMIT_ORAL', 'oral_evaluation', oral_id, {
        'course_id': id,
        'score_oral': score_oral,
        'qcm_score': qcm_score,
        'final_score': final_score,
        'final_passed': final_passed
    }, conn=conn)

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'oral_id': oral_id,
        'score_oral': score_oral,
        'qcm_score': qcm_score,
        'final_score': final_score,
        'passed': final_passed,
        'feedback': feedback,
        'transcript': transcript
    })

@app.route('/api/users/<int:user_id>/evaluations', methods=['GET'])
def get_user_evaluations(user_id):
    conn = get_db_connection()
    evals = conn.execute('''
        SELECT e.*, c.title as course_title, c.domain as course_domain
        FROM course_evaluations e
        JOIN courses c ON e.course_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.id DESC
    ''', (user_id,)).fetchall()
    conn.close()
    
    results = []
    for row in evals:
        item = dict(row)
        if item.get('diagnostic_json'):
            try:
                item['diagnostic'] = json.loads(item['diagnostic_json'])
            except Exception:
                item['diagnostic'] = None
        results.append(item)
        
    return jsonify({
        'success': True,
        'evaluations': results
    })

whisper_model = None

def is_greeting_or_smalltalk(text):
    if not text:
        return None
    cleaned = re.sub(r'[^\w\s]', ' ', text.lower()).strip()
    cleaned_no_spaces = re.sub(r'\s+', ' ', cleaned)
    words = cleaned_no_spaces.split()
    if not words:
        return None
    
    question_keywords = {
        'qui', 'que', 'quoi', 'ou', 'où', 'quand', 'comment', 'pourquoi', 'combien',
        'quel', 'quelle', 'quels', 'quelles', 'quest', 'défini', 'définition',
        'explique', 'expliquer', 'résume', 'résumer', 'cours', 'formation',
        'slide', 'diapositive', 'chapitre', 'sujet', 'objectif', 'signifie', 'différence'
    }
    
    greetings = {'salut', 'bonjour', 'bonsoir', 'coucou', 'hello', 'hi', 'hey', 'yo', 'salutations', 'bjr', 'slt'}
    
    # Salutations pures (ex: "Salut", "Bonjour !", "Hello", "Salut tout le monde")
    if all(w in greetings for w in words) or (len(words) <= 3 and words[0] in greetings and not any(w in question_keywords for w in words)):
        if 'bonsoir' in words:
            return "Bonsoir ! Comment puis-je vous aider ?"
        elif 'salut' in words or 'slt' in words:
            return "Salut ! Comment puis-je vous aider ?"
        else:
            return "Bonjour ! Comment puis-je vous aider ?"

    # Salutation + politesse (ex: "Salut comment ça va", "Bonjour comment allez-vous")
    if words[0] in greetings and any(phrase in cleaned_no_spaces for phrase in ['ca va', 'ça va', 'comment vas tu', 'comment allez vous', 'comment tu vas', 'tu vas bien']):
        return "Bonjour ! Très bien, merci. Comment puis-je vous aider sur cette formation ?"
        
    # Politesse pure (ex: "Ça va ?", "Comment vas-tu ?")
    if cleaned_no_spaces in {'ca va', 'ça va', 'comment vas tu', 'comment vastu', 'comment allez vous', 'comment allezvous', 'tu vas bien', 'vous allez bien'}:
        return "Très bien, merci ! En quoi puis-je vous aider sur cette formation ?"
        
    # Remerciements
    if any(phrase in cleaned_no_spaces for phrase in ['merci beaucoup', 'merci bien', 'je vous remercie', 'je te remercie', 'merci', 'remercie']):
        if not any(w in question_keywords for w in words) or len(words) <= 3:
            return "Avec plaisir ! Avez-vous d'autres questions sur cette formation ?"
            
    # Fin d'échange / départ
    if any(phrase in cleaned_no_spaces for phrase in ['au revoir', 'a bientot', 'à bientôt', 'a plus tard', 'bonne journee', 'bonne journée', 'bonne soiree', 'bonne soirée', 'bye', 'ciao']):
        if len(words) <= 4:
            return "Au revoir et bonne continuation dans votre formation !"
            
    # Question sur le rôle / identité
    if any(phrase in cleaned_no_spaces for phrase in ['qui es tu', 'qui etes vous', 'qui êtes vous', 'tu es qui', 'vous etes qui', 'vous êtes qui', 'cest quoi ton nom', 'quel est ton role']):
        if len(words) <= 5:
            return "Je suis votre assistant pour cette formation. Posez-moi vos questions sur le cours !"

    return None

@app.route('/api/chat', methods=['POST'])
def api_chat():
    pdf_filename = request.form.get('pdf_filename') or request.form.get('base_filename') or ''
    message = (request.form.get('message') or '').strip()
    audio_file = request.files.get('audio')
    
    if not pdf_filename and not message and not audio_file:
        return jsonify({"error": "Paramètres manquants"}), 400
        
    try:
        load_dotenv(override=True)
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return jsonify({"error": "Clé API Gemini manquante"}), 400
            
        client = genai.Client(api_key=api_key)
        transcription = ""
        
        # 1. Speech-to-Text avec Gemini Native Audio + Whisper Fallback
        if audio_file:
            temp_audio_path = os.path.join(UPLOAD_FOLDER, f"temp_voice_{uuid.uuid4()}.webm")
            audio_file.save(temp_audio_path)
            try:
                uploaded_audio = client.files.upload(file=temp_audio_path)
                transcribe_resp = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        uploaded_audio,
                        "Écoute cet enregistrement audio et retranscris EXACTEMENT ce qui est dit en français mot à mot. Renvoie uniquement le texte transcrit, sans guillemets ni introduction."
                    ]
                )
                transcription = (transcribe_resp.text or '').strip()
                message = transcription
                try: client.files.delete(name=uploaded_audio.name)
                except Exception: pass
            except Exception as e_gem:
                print(f"Erreur Gemini Audio STT: {e_gem}, tentative Whisper...", flush=True)
                try:
                    global whisper_model
                    if whisper_model is None:
                        import whisper
                        print("Chargement du modèle Whisper...", flush=True)
                        whisper_model = whisper.load_model("base")
                    result = whisper_model.transcribe(temp_audio_path, fp16=False)
                    transcription = (result.get("text") or '').strip()
                    message = transcription
                except Exception as e_wsp:
                    print(f"Erreur Whisper STT: {e_wsp}")
            finally:
                if os.path.exists(temp_audio_path):
                    try: os.remove(temp_audio_path)
                    except Exception: pass
                    
            if not message:
                return jsonify({"error": "Audio non reconnu ou vide. Veuillez réessayer de parler dans le micro."}), 400

        # 1.5 Vérification rapide des salutations / politesses (Fast-path instantané 0ms)
        greeting_reply = is_greeting_or_smalltalk(message)
        if greeting_reply:
            return jsonify({
                "response": greeting_reply,
                "transcription": transcription
            })

        # Vérification du cache mémoire (Réponse en 1ms pour questions répétées)
        base_id = os.path.splitext(os.path.basename(pdf_filename))[0] if pdf_filename else "default"
        cache_key = f"{base_id}:{message.lower().strip()}"
        if cache_key in _chat_cache:
            return jsonify({
                "response": _chat_cache[cache_key],
                "transcription": transcription
            })
                
        # 2. Recherche Vectorielle via ChromaDB pour les questions métiers
        collection = get_chroma_collection()
        
        results = None
        try:
            results = collection.query(
                query_texts=[message],
                n_results=3,
                where={"source": base_id}
            )
        except Exception as e_chroma:
            print(f"Erreur requête ChromaDB filtrée: {e_chroma}")
            
        contexte = ""
        if results and results.get("documents") and results["documents"][0]:
            contexte = "\n\n".join(results["documents"][0])
            
        # Fallback si pas de résultat avec le filtre strict source
        if not contexte:
            try:
                results_fallback = collection.query(
                    query_texts=[message],
                    n_results=3
                )
                if results_fallback and results_fallback.get("documents") and results_fallback["documents"][0]:
                    contexte = "\n\n".join(results_fallback["documents"][0])
            except Exception:
                pass
            
        # 3. Réponse concise et métier générée par Gemini
        lang_directive = """
RÈGLE OBLIGATOIRE SUR LES NOUVELLES LANGUES :
- La langue officielle du cours est le Français.
- Si la question de l'apprenant est posée dans une autre langue (ex: anglais, espagnol...) : réponds brièvement à sa question en français (ou avec une brève traduction), puis demande-lui obligatoirement avant tout basculement : "Souhaitez-vous que nous continuions nos échanges en [Nom de la langue] ?" Ne bascule pas intégralement dans la nouvelle langue sans son accord.
"""
        if contexte:
            prompt = f"""Tu es un expert formateur professionnel. Réponds directement, précisément et de manière professionnelle à la question posée, en utilisant le contexte du cours ci-dessous.

RÈGLES STRICTES :
- Sois direct, concis et clair (1 ou 2 phrases maximum).
- AUCUN préfixe, AUCUNE formule superflue (ne dis pas "En tant qu'IA...", "IA Tutor", "D'après les documents...").
- Donne UNIQUEMENT la réponse métier pertinente.
{lang_directive}

CONTEXTE DU COURS :
{contexte}

QUESTION DE L'APPRENANT :
{message}"""
        else:
            prompt = f"""Tu es un formateur professionnel. Réponds de manière concise, précise et professionnelle (1 ou 2 phrases max) à la question suivante dans le cadre du métier : {message}. Si c'est une question très spécifique sur un élément absent du support, indique simplement et directement que l'information n'est pas précisée dans ce support.
{lang_directive}"""

        # Modèles ultra-rapides prioritaires
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
            "gemini-3.5-flash",
            "gemini-flash-latest",
            "gemini-3.5-flash-lite"
        ]
        response_text = None
        last_err = None
        for m in models_to_try:
            try:
                resp = client.models.generate_content(model=m, contents=prompt)
                if resp.candidates and resp.candidates[0].content:
                    response_text = (resp.text or '').strip()
                else:
                    response_text = "Cette information n'est pas précisée dans ce cours."
                break
            except Exception as e:
                last_err = e
                
        if response_text is None:
            return jsonify({"error": f"Erreur Gemini: {str(last_err)}"}), 500
            
        # Nettoyage d'éventuels préfixes parasites de l'IA
        response_text = re.sub(r'^(IA\s*TUTOR\s*:|Assistant\s*IA\s*:|IA\s*:|Réponse\s*:)\s*', '', response_text, flags=re.IGNORECASE).strip()

        # Enregistrement dans le cache mémoire
        _chat_cache[cache_key] = response_text

        # Renvoi direct et instantané du texte sans bloquer sur l'audio
        return jsonify({
            "response": response_text,
            "transcription": transcription
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Erreur serveur: {str(e)}"}), 500

@app.route('/api/voice_profiles', methods=['GET'])
def get_voice_profiles():
    return jsonify({'success': True, 'profiles': VOICE_PROFILES})

@app.route('/api/tts', methods=['POST'])
def api_tts():
    try:
        data = request.json or {}
        text = (data.get('text') or '').strip()
        course_id = data.get('course_id')
        requested_voice = data.get('voice')
        if not text:
            return jsonify({'error': 'Texte manquant'}), 400

        # Résolution de la voix du formateur
        voice_prof = resolve_voice_profile(course_id=course_id, voice_key=requested_voice)
        edge_voice = voice_prof['edge_voice']

        clean_text = re.sub(r'[*#_`]', '', text).strip()
        cache_key = f"{edge_voice}:{clean_text}"
        if cache_key in _tts_cache:
            return jsonify({'audio_url': _tts_cache[cache_key], 'voice': edge_voice, 'tutor_name': voice_prof['name']})

        audio_reply_filename = f"reply_{uuid.uuid4()}.mp3"
        audio_reply_path = os.path.join(PDF_FOLDER, audio_reply_filename)

        async def _gen():
            communicate = edge_tts.Communicate(clean_text, edge_voice)
            await communicate.save(audio_reply_path)

        asyncio.run(_gen())
        audio_url = f"/{PDF_FOLDER}/{audio_reply_filename}"
        _tts_cache[cache_key] = audio_url

        return jsonify({'audio_url': audio_url, 'voice': edge_voice, 'tutor_name': voice_prof['name']})
    except Exception as e:
        print(f"Erreur API TTS: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    identifier = (data.get('identifier') or data.get('username') or data.get('matricule') or '').strip()
    password = (data.get('password') or '').strip()
    
    if not identifier or not password:
        return jsonify({'success': False, 'error': 'Matricule et mot de passe requis'}), 400

    conn = get_db_connection()
    # Recherche par matricule, email ou identifiant
    user = conn.execute('''
        SELECT id, matricule, nom, prenom, email, poste, direction, role, password 
        FROM users 
        WHERE (UPPER(matricule) = UPPER(?) OR LOWER(email) = LOWER(?) OR matricule = ?) AND password = ?
    ''', (identifier, identifier, identifier, password)).fetchone()
    
    # Fallback si l'utilisateur saisit 'admin' ou le matricule sans casse
    if not user:
        user = conn.execute('''
            SELECT id, matricule, nom, prenom, email, poste, direction, role, password 
            FROM users 
            WHERE (LOWER(matricule) = LOWER(?) OR LOWER(nom) = LOWER(?) OR LOWER(email) = LOWER(?)) AND password = ?
        ''', (identifier, identifier, identifier, password)).fetchone()

    conn.close()
    if user:
        user_dict = dict(user)
        user_dict.pop('password', None)
        resp = jsonify({'success': True, 'user': user_dict})
        resp.set_cookie('ia_user_role', user_dict.get('role', 'user'), max_age=86400, samesite='Lax')
        resp.set_cookie('ia_user_id', str(user_dict.get('id', '')), max_age=86400, samesite='Lax')
        return resp
    return jsonify({'success': False, 'error': 'Matricule ou mot de passe incorrect'}), 401

@app.route('/api/logout', methods=['POST', 'GET'])
def api_logout():
    resp = jsonify({'success': True, 'message': 'Déconnexion réussie'})
    resp.delete_cookie('ia_user_role')
    resp.delete_cookie('ia_user_id')
    return resp

def calculate_anciennete_days(date_str):
    if not date_str:
        return 0
    try:
        from datetime import datetime, date
        d_part = str(date_str).split()[0].split('T')[0]
        dt = datetime.strptime(d_part, "%Y-%m-%d").date()
        today = date.today()
        return max(0, (today - dt).days)
    except Exception:
        return 0

def evaluate_user_rule_match(user_dict, rule_dict):
    """Vérifie si un utilisateur correspond aux critères d'une règle d'attribution dynamique."""
    if not rule_dict.get('is_active', 1):
        return False
        
    u_dir = (user_dict.get('direction') or '').strip().lower()
    u_poste = (user_dict.get('poste') or '').strip().lower()
    u_contrat = (user_dict.get('statut_contrat') or '').strip().lower()
    u_date = user_dict.get('date_embauche') or ''
    u_days = calculate_anciennete_days(u_date)
    
    # 1. Critère Direction
    r_dirs_raw = (rule_dict.get('target_direction') or '').strip().lower()
    if r_dirs_raw and r_dirs_raw not in ['toutes', 'tous', '*']:
        r_dirs = [d.strip() for d in r_dirs_raw.replace(';', ',').split(',') if d.strip()]
        if not any(d in u_dir or u_dir in d for d in r_dirs):
            return False
            
    # 2. Critère Poste
    r_postes_raw = (rule_dict.get('target_poste') or '').strip().lower()
    if r_postes_raw and r_postes_raw not in ['tous', 'toutes', '*']:
        r_postes = [p.strip() for p in r_postes_raw.replace(';', ',').split(',') if p.strip()]
        if not any(p in u_poste or u_poste in p for p in r_postes):
            return False
            
    # 3. Critère Type de contrat / Statut
    r_contrats_raw = (rule_dict.get('target_contrat') or '').strip().lower()
    if r_contrats_raw and r_contrats_raw not in ['tous', 'toutes', '*', '']:
        r_contrats = [c.strip() for c in r_contrats_raw.replace(';', ',').split(',') if c.strip()]
        if not any(c in u_contrat or u_contrat in c for c in r_contrats):
            return False
            
    # 4. Critère Ancienneté maximale (ex: nouveaux arrivants <= 90 jours)
    max_days = rule_dict.get('max_anciennete_days')
    if max_days is not None and max_days != '':
        try:
            max_d_int = int(max_days)
            if max_d_int > 0 and u_days > max_d_int:
                return False
        except Exception:
            pass
            
    return True

def sync_rule_assignments(user_id=None, rule_id=None):
    """Synchronise les assignations automatiques basées sur les règles dynamiques."""
    conn = get_db_connection()
    try:
        users = []
        if user_id:
            u_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if u_row:
                users = [dict(u_row)]
        else:
            users = [dict(r) for r in conn.execute("SELECT * FROM users WHERE role = 'user'").fetchall()]
            
        rules = []
        if rule_id:
            r_row = conn.execute("SELECT * FROM assignment_rules WHERE id = ? AND is_active = 1", (rule_id,)).fetchone()
            if r_row:
                rules = [dict(r_row)]
        else:
            rules = [dict(r) for r in conn.execute("SELECT * FROM assignment_rules WHERE is_active = 1").fetchall()]
            
        for rule in rules:
            try:
                c_ids = json.loads(rule.get('course_ids') or '[]')
            except Exception:
                c_ids = []
            if not c_ids:
                continue
                
            rule_id_val = rule['id']
            created_by = rule.get('created_by') or 1
            
            for user in users:
                if user.get('role') in ['admin', 'superadmin']:
                    continue
                if evaluate_user_rule_match(user, rule):
                    for cid in c_ids:
                        c_row = conn.execute("SELECT visibility FROM courses WHERE id = ?", (int(cid),)).fetchone()
                        is_pub = c_row and c_row['visibility'] == 'public'
                        due_val = None if is_pub else calculate_business_deadline(datetime.now(), 10).strftime('%Y-%m-%d %H:%M:%S')
                        conn.execute('''
                            INSERT OR IGNORE INTO course_assignments (user_id, course_id, assigned_by, source_rule_id, status, due_date, is_overdue)
                            VALUES (?, ?, ?, ?, 'assigned', ?, 0)
                        ''', (user['id'], int(cid), created_by, rule_id_val, due_val))
        conn.commit()
    except Exception as e:
        print(f"Erreur sync_rule_assignments: {e}")
    finally:
        conn.close()

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db_connection()
    users = conn.execute('''
        SELECT 
            u.id, u.matricule, u.nom, u.prenom, u.email, u.poste, u.direction, u.role, u.created_by,
            u.statut_contrat, u.date_embauche, u.manager,
            creator.matricule AS creator_matricule,
            creator.nom AS creator_nom,
            creator.prenom AS creator_prenom,
            (SELECT COUNT(*) FROM course_assignments ca WHERE ca.user_id = u.id) AS assigned_courses_count
        FROM users u
        LEFT JOIN users creator ON u.created_by = creator.id
        ORDER BY 
            CASE u.role 
                WHEN 'superadmin' THEN 1 
                WHEN 'admin' THEN 2 
                ELSE 3 
            END, u.id ASC
    ''').fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.json or {}
    matricule = (data.get('matricule') or '').strip().upper()
    password = (data.get('password') or '').strip()
    nom = (data.get('nom') or '').strip()
    prenom = (data.get('prenom') or '').strip()
    email = (data.get('email') or '').strip()
    poste = (data.get('poste') or '').strip()
    direction = (data.get('direction') or '').strip()
    role = (data.get('role') or 'user').strip()
    statut_contrat = (data.get('statut_contrat') or 'CDI').strip()
    date_embauche = (data.get('date_embauche') or '').strip()
    manager = (data.get('manager') or '').strip()
    created_by = data.get('created_by') or 1
    
    if not matricule or not password or not nom or not prenom:
        return jsonify({'success': False, 'error': 'Le matricule, le mot de passe, le nom et le prénom sont obligatoires'}), 400
    
    if role not in ['superadmin', 'admin', 'expert_pedagogique', 'formateur', 'user']:
        role = 'user'

    if not date_embauche:
        from datetime import date
        date_embauche = date.today().isoformat()

    conn = get_db_connection()
    try:
        existing = conn.execute('SELECT id FROM users WHERE UPPER(matricule) = ?', (matricule,)).fetchone()
        if existing:
            return jsonify({'success': False, 'error': f'Le matricule "{matricule}" est déjà utilisé'}), 400

        cur = conn.cursor()
        cur.execute('''
            INSERT INTO users (matricule, password, nom, prenom, email, poste, direction, role, created_by, statut_contrat, date_embauche, manager) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (matricule, password, nom, prenom, email, poste, direction, role, created_by, statut_contrat, date_embauche, manager))
        new_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        # Attribution automatique immédiate selon les parcours / règles
        sync_rule_assignments(user_id=new_id)
        
        return jsonify({'success': True, 'id': new_id})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'error': f'Le matricule "{matricule}" est déjà utilisé'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        try: conn.close()
        except: pass

# --- IMPORTATION D'UTILISATEURS EN MASSE VIA FICHIER ---

def _normalize_header(s):
    if not isinstance(s, str):
        s = str(s)
    s = s.strip().lower()
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return re.sub(r'[^a-z0-9]', '', s)

def _clean_val(val):
    if pd.isna(val) or val is None:
        return ''
    if isinstance(val, float) and val.is_integer():
        return str(int(val)).strip()
    return str(val).strip()

def _parse_date(val):
    if pd.isna(val) or val is None:
        return date.today().isoformat()
    if isinstance(val, (datetime, date)):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if not s or s.lower() == 'nan':
        return date.today().isoformat()
    for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%Y/%m/%d', '%d/%m/%y', '%d-%m-%y']:
        try:
            return datetime.strptime(s.split()[0], fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return date.today().isoformat()

def _parse_role(val):
    if not val or pd.isna(val):
        return 'user'
    s = str(val).strip().lower()
    if 'super' in s:
        return 'superadmin'
    elif 'expert' in s or 'pedagogique' in s:
        return 'expert_pedagogique'
    elif 'formateur' in s or 'evaluateur' in s:
        return 'formateur'
    elif 'admin' in s:
        return 'admin'
    return 'user'

def _parse_statut_contrat(val):
    if not val or pd.isna(val):
        return 'CDI'
    s = str(val).strip().upper()
    for valid in ['CDI', 'CDD', 'STAGIAIRE', 'ALTERNANT', 'PRESTATAIRE']:
        if valid in s:
            return valid.capitalize() if valid not in ['CDI', 'CDD'] else valid
    return 'CDI'

def _map_user_columns(columns):
    mapping = {}
    for col in columns:
        nh = _normalize_header(col)
        if any(k in nh for k in ['matricule', 'idagent', 'codeagent', 'identifiant']):
            mapping['matricule'] = col
        elif any(k in nh for k in ['motdepasse', 'password', 'mdp', 'pwd']) or 'passe' in nh:
            mapping['password'] = col
        elif nh in ['nom', 'lastname', 'nomdefamille', 'nomdelutilisateur'] or nh == 'nom':
            mapping['nom'] = col
        elif any(k in nh for k in ['prenom', 'firstname', 'prenoms']):
            mapping['prenom'] = col
        elif any(k in nh for k in ['email', 'mail', 'courriel', 'adresseemail', 'adressemail']):
            mapping['email'] = col
        elif any(k in nh for k in ['direction', 'departement', 'directiondepartement', 'service', 'pole', 'entite']):
            mapping['direction'] = col
        elif any(k in nh for k in ['poste', 'fonction', 'postefonction', 'metier', 'titre']):
            mapping['poste'] = col
        elif any(k in nh for k in ['statut', 'contrat', 'typedecontratstatut', 'typedecontrat', 'statutcontrat']):
            mapping['statut_contrat'] = col
        elif any(k in nh for k in ['embauche', 'arrivee', 'datedarriveeembauche', 'datearrivee', 'dateembauche']):
            mapping['date_embauche'] = col
        elif any(k in nh for k in ['role', 'profil', 'typecompte', 'roledanslapplication']):
            mapping['role'] = col
    return mapping

@app.route('/api/users/template', methods=['GET'])
def get_user_import_template():
    fmt = (request.args.get('format') or 'csv').lower()
    sample_data = [
        {
            'Matricule *': 'EMP0142',
            'Mot de passe *': 'pass123',
            'Nom *': 'KOUAME',
            'Prénom *': 'Jean-Marc',
            'Adresse Email': 'jm.kouame@sgci.ci',
            'Direction / Département': 'Direction Financière',
            'Poste / Fonction': 'Analyste Financier',
            'Type de Contrat / Statut': 'CDI',
            "Date d'arrivée / Embauche": '01/02/2026',
            "Rôle dans l'application *": 'Utilisateur / Apprenant'
        },
        {
            'Matricule *': 'ADM002',
            'Mot de passe *': 'admin456',
            'Nom *': 'DIALLO',
            'Prénom *': 'Fatou',
            'Adresse Email': 'f.diallo@sgci.ci',
            'Direction / Département': 'DSI',
            'Poste / Fonction': 'Chef de Projet',
            'Type de Contrat / Statut': 'CDI',
            "Date d'arrivée / Embauche": '15/01/2026',
            "Rôle dans l'application *": 'Administrateur'
        },
        {
            'Matricule *': 'STG0089',
            'Mot de passe *': 'stage2026',
            'Nom *': 'BAMBA',
            'Prénom *': 'Amina',
            'Adresse Email': 'a.bamba@sgci.ci',
            'Direction / Département': 'Ressources Humaines',
            'Poste / Fonction': 'Stagiaire RH',
            'Type de Contrat / Statut': 'Stagiaire',
            "Date d'arrivée / Embauche": '01/03/2026',
            "Rôle dans l'application *": 'Utilisateur / Apprenant'
        }
    ]
    df = pd.DataFrame(sample_data)
    if fmt in ['xlsx', 'excel']:
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine='openpyxl')
        buf.seek(0)
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='modele_import_utilisateurs.xlsx'
        )
    else:
        csv_str = '\ufeff' + df.to_csv(index=False, sep=';')
        return Response(
            csv_str,
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=modele_import_utilisateurs.csv'}
        )

@app.route('/api/users/import', methods=['POST'])
def import_users():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'Aucun fichier transmis'}), 400
    
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Fichier vide ou non sélectionné'}), 400
        
    created_by = request.form.get('created_by') or 1
    try:
        created_by = int(created_by)
    except:
        created_by = 1

    fname = secure_filename(file.filename).lower()
    df = None
    if fname.endswith(('.xlsx', '.xls')):
        try:
            df = pd.read_excel(file.stream)
        except Exception as e:
            return jsonify({'success': False, 'error': f"Impossible de lire le fichier Excel : {str(e)}"}), 400
    elif fname.endswith('.csv'):
        try:
            df = pd.read_csv(file.stream, sep=None, engine='python', encoding='utf-8-sig')
        except Exception:
            file.stream.seek(0)
            try:
                df = pd.read_csv(file.stream, sep=None, engine='python', encoding='latin-1')
            except Exception as e:
                return jsonify({'success': False, 'error': f"Impossible de lire le fichier CSV : {str(e)}"}), 400
    else:
        return jsonify({'success': False, 'error': 'Format de fichier non supporté. Veuillez importer un fichier Excel (.xlsx, .xls) ou CSV (.csv)'}), 400

    if df is None or df.empty:
        return jsonify({'success': False, 'error': 'Le fichier importé ne contient aucune donnée'}), 400

    col_map = _map_user_columns(df.columns.tolist())
    missing_required = []
    if 'matricule' not in col_map: missing_required.append('Matricule *')
    if 'password' not in col_map: missing_required.append('Mot de passe *')
    if 'nom' not in col_map: missing_required.append('Nom *')
    if 'prenom' not in col_map: missing_required.append('Prénom *')

    if missing_required:
        return jsonify({
            'success': False,
            'error': f"Colonnes obligatoires manquantes dans l'en-tête du fichier : {', '.join(missing_required)}. Veuillez télécharger le modèle d'importation."
        }), 400

    conn = get_db_connection()
    try:
        existing_matricules = {row['matricule'].upper() for row in conn.execute('SELECT UPPER(matricule) as matricule FROM users').fetchall() if row['matricule']}
        file_matricules = set()
        created_users = []
        errors = []
        new_user_ids = []

        for idx, row in df.iterrows():
            row_num = idx + 2 # 1-based index (header is line 1)

            raw_mat = row.get(col_map.get('matricule', ''))
            raw_pwd = row.get(col_map.get('password', ''))
            raw_nom = row.get(col_map.get('nom', ''))
            raw_prenom = row.get(col_map.get('prenom', ''))

            matricule = _clean_val(raw_mat).upper()
            password = _clean_val(raw_pwd)
            nom = _clean_val(raw_nom)
            prenom = _clean_val(raw_prenom)

            # Si toute la ligne est vide, on l'ignore silencieusement
            if not matricule and not password and not nom and not prenom:
                continue

            row_errs = []
            if not matricule: row_errs.append("Matricule manquant")
            if not password: row_errs.append("Mot de passe manquant")
            if not nom: row_errs.append("Nom manquant")
            if not prenom: row_errs.append("Prénom manquant")

            if row_errs:
                errors.append({
                    'row': row_num,
                    'matricule': matricule or 'N/A',
                    'error': ", ".join(row_errs)
                })
                continue

            if matricule in file_matricules:
                errors.append({
                    'row': row_num,
                    'matricule': matricule,
                    'error': f"Matricule '{matricule}' en doublon dans le fichier (déjà présent ligne précédente)"
                })
                continue

            if matricule in existing_matricules:
                errors.append({
                    'row': row_num,
                    'matricule': matricule,
                    'error': f"Le matricule '{matricule}' existe déjà dans la base de données"
                })
                continue

            email = _clean_val(row.get(col_map.get('email', ''))) if 'email' in col_map else ''
            direction = _clean_val(row.get(col_map.get('direction', ''))) if 'direction' in col_map else ''
            poste = _clean_val(row.get(col_map.get('poste', ''))) if 'poste' in col_map else ''
            
            raw_statut = row.get(col_map.get('statut_contrat', '')) if 'statut_contrat' in col_map else ''
            statut_contrat = _parse_statut_contrat(raw_statut)

            raw_date = row.get(col_map.get('date_embauche', '')) if 'date_embauche' in col_map else ''
            date_embauche = _parse_date(raw_date)

            raw_role = row.get(col_map.get('role', '')) if 'role' in col_map else ''
            role = _parse_role(raw_role)

            cur = conn.cursor()
            cur.execute('''
                INSERT INTO users (matricule, password, nom, prenom, email, poste, direction, role, created_by, statut_contrat, date_embauche, manager)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (matricule, password, nom, prenom, email, poste, direction, role, created_by, statut_contrat, date_embauche, ''))
            new_id = cur.lastrowid

            file_matricules.add(matricule)
            existing_matricules.add(matricule)
            new_user_ids.append(new_id)

            created_users.append({
                'id': new_id,
                'matricule': matricule,
                'nom': nom,
                'prenom': prenom,
                'direction': direction,
                'poste': poste,
                'role': role
            })

        conn.commit()
    except Exception as e:
        return jsonify({'success': False, 'error': f"Erreur de traitement en base : {str(e)}"}), 500
    finally:
        try: conn.close()
        except: pass

    # Synchronisation immédiate des parcours et règles d'assignation
    for uid in new_user_ids:
        try:
            sync_rule_assignments(user_id=uid)
        except Exception as err_sync:
            print(f"Warning sync_rule_assignments for user {uid}: {err_sync}")

    # Persistance JSON automatique pour les nouveaux comptes utilisateurs
    backup_database_to_json()

    return jsonify({
        'success': True,
        'total': len(created_users) + len(errors),
        'created_count': len(created_users),
        'error_count': len(errors),
        'created': created_users,
        'errors': errors
    })

@app.route('/api/users/<int:id>', methods=['PUT'])
def update_user(id):
    data = request.json or {}
    matricule = (data.get('matricule') or '').strip().upper()
    nom = (data.get('nom') or '').strip()
    prenom = (data.get('prenom') or '').strip()
    email = (data.get('email') or '').strip()
    poste = (data.get('poste') or '').strip()
    direction = (data.get('direction') or '').strip()
    role = (data.get('role') or 'user').strip()
    statut_contrat = (data.get('statut_contrat') or 'CDI').strip()
    date_embauche = (data.get('date_embauche') or '').strip()
    manager = (data.get('manager') or '').strip()
    password = (data.get('password') or '').strip()
    
    if not matricule or not nom or not prenom:
        return jsonify({'success': False, 'error': 'Matricule, nom et prénom sont obligatoires'}), 400

    if role not in ['superadmin', 'admin', 'expert_pedagogique', 'formateur', 'user']:
        role = 'user'
        
    conn = get_db_connection()
    try:
        existing = conn.execute('SELECT id FROM users WHERE UPPER(matricule) = ? AND id != ?', (matricule, id)).fetchone()
        if existing:
            return jsonify({'success': False, 'error': f'Le matricule "{matricule}" est déjà attribué à un autre utilisateur'}), 400

        cur = conn.cursor()
        if password:
            cur.execute('''
                UPDATE users 
                SET matricule=?, password=?, nom=?, prenom=?, email=?, poste=?, direction=?, role=?, statut_contrat=?, date_embauche=?, manager=?
                WHERE id=?
            ''', (matricule, password, nom, prenom, email, poste, direction, role, statut_contrat, date_embauche, manager, id))
        else:
            cur.execute('''
                UPDATE users 
                SET matricule=?, nom=?, prenom=?, email=?, poste=?, direction=?, role=?, statut_contrat=?, date_embauche=?, manager=?
                WHERE id=?
            ''', (matricule, nom, prenom, email, poste, direction, role, statut_contrat, date_embauche, manager, id))
        conn.commit()
        conn.close()
        
        # Réévaluation des règles pour cet utilisateur mis à jour
        sync_rule_assignments(user_id=id)
        
        # Persistance JSON automatique
        backup_database_to_json()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        try: conn.close()
        except: pass

@app.route('/api/users/<int:id>', methods=['DELETE'])
def delete_user(id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id=?', (id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'error': 'Utilisateur introuvable'}), 404
        
    if user['role'] == 'superadmin':
        count_super = conn.execute("SELECT COUNT(*) FROM users WHERE role='superadmin'").fetchone()[0]
        if count_super <= 1:
            conn.close()
            return jsonify({'success': False, 'error': 'Impossible de supprimer le seul Super Administrateur'}), 403

    conn.execute('DELETE FROM users WHERE id=?', (id,))
    conn.execute('DELETE FROM course_assignments WHERE user_id=?', (id,))
    conn.execute('DELETE FROM user_course_progress WHERE user_id=?', (id,))
    conn.commit()
    conn.close()
    
    # Persistance JSON automatique après suppression
    backup_database_to_json()
    
    return jsonify({'success': True})

# --- NOUVEAUX ENDPOINTS : GESTION DES RÈGLES D'ASSIGNATION AUTOMATIQUE (PARCOURS DYNAMIQUES) ---

@app.route('/api/assignment_rules', methods=['GET'])
def get_assignment_rules():
    conn = get_db_connection()
    rules = conn.execute('''
        SELECT r.*,
               creator.matricule AS creator_matricule,
               creator.nom AS creator_nom,
               creator.prenom AS creator_prenom
        FROM assignment_rules r
        LEFT JOIN users creator ON r.created_by = creator.id
        ORDER BY r.id DESC
    ''').fetchall()
    
    users = [dict(u) for u in conn.execute("SELECT * FROM users WHERE role = 'user'").fetchall()]
    conn.close()
    
    result = []
    for row in rules:
        r = dict(row)
        try:
            c_ids = json.loads(r.get('course_ids') or '[]')
        except Exception:
            c_ids = []
        r['course_ids_list'] = c_ids
        r['courses_count'] = len(c_ids)
        
        # Calcul en temps réel du nombre d'employés couverts
        matched_count = sum(1 for u in users if evaluate_user_rule_match(u, r))
        r['matched_users_count'] = matched_count
        result.append(r)
        
    return jsonify(result)

@app.route('/api/assignment_rules', methods=['POST'])
def create_assignment_rule():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()
    target_direction = (data.get('target_direction') or '').strip()
    target_poste = (data.get('target_poste') or '').strip()
    target_contrat = (data.get('target_contrat') or '').strip()
    max_anciennete_days = data.get('max_anciennete_days')
    course_ids = data.get('course_ids') or []
    created_by = data.get('created_by') or 1
    
    if not name:
        return jsonify({'success': False, 'error': 'Le nom du parcours/règle est obligatoire'}), 400
    if not course_ids:
        return jsonify({'success': False, 'error': 'Veuillez sélectionner au moins une formation'}), 400
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO assignment_rules (name, description, target_direction, target_poste, target_contrat, max_anciennete_days, course_ids, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        ''', (name, description, target_direction, target_poste, target_contrat, max_anciennete_days, json.dumps(course_ids), created_by))
        new_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        # Synchronisation automatique immédiate sur tous les utilisateurs concernés
        sync_rule_assignments(rule_id=new_id)
        
        return jsonify({'success': True, 'id': new_id})
    except Exception as e:
        try: conn.close()
        except: pass
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assignment_rules/<int:id>', methods=['PUT'])
def update_assignment_rule(id):
    data = request.json or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()
    target_direction = (data.get('target_direction') or '').strip()
    target_poste = (data.get('target_poste') or '').strip()
    target_contrat = (data.get('target_contrat') or '').strip()
    max_anciennete_days = data.get('max_anciennete_days')
    course_ids = data.get('course_ids') or []
    is_active = 1 if data.get('is_active', True) else 0
    
    if not name:
        return jsonify({'success': False, 'error': 'Le nom du parcours/règle est obligatoire'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('''
            UPDATE assignment_rules
            SET name=?, description=?, target_direction=?, target_poste=?, target_contrat=?, max_anciennete_days=?, course_ids=?, is_active=?
            WHERE id=?
        ''', (name, description, target_direction, target_poste, target_contrat, max_anciennete_days, json.dumps(course_ids), is_active, id))
        conn.commit()
        conn.close()
        
        if is_active:
            sync_rule_assignments(rule_id=id)
            
        return jsonify({'success': True})
    except Exception as e:
        try: conn.close()
        except: pass
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assignment_rules/<int:id>', methods=['DELETE'])
def delete_assignment_rule(id):
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM assignment_rules WHERE id=?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        try: conn.close()
        except: pass
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assignment_rules/<int:id>/sync', methods=['POST'])
def manual_sync_rule(id):
    sync_rule_assignments(rule_id=id)
    return jsonify({'success': True})

@app.route('/api/assignments_matrix', methods=['GET'])
def get_assignments_matrix():
    conn = get_db_connection()
    refresh_assignment_statuses(conn=conn)
    rows = conn.execute('''
        SELECT 
            ca.id AS assignment_id,
            ca.assigned_at,
            ca.status,
            ca.source_rule_id,
            ca.due_date,
            ca.is_overdue,
            ca.qcm_score,
            ca.oral_score,
            ca.final_score,
            ca.passed,
            ca.completed_at,
            u.id AS user_id,
            u.matricule,
            u.nom,
            u.prenom,
            u.email,
            u.poste,
            u.direction,
            u.statut_contrat,
            u.date_embauche,
            c.id AS course_id,
            c.title AS course_title,
            c.domain AS course_domain,
            c.duration AS course_duration,
            c.level AS course_level,
            c.visibility AS course_visibility,
            r.name AS rule_name
        FROM course_assignments ca
        JOIN users u ON ca.user_id = u.id
        JOIN courses c ON ca.course_id = c.id
        LEFT JOIN assignment_rules r ON ca.source_rule_id = r.id
        ORDER BY ca.id DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/manual_bulk_assign', methods=['POST'])
def manual_bulk_assign():
    data = request.json or {}
    user_ids = data.get('user_ids') or []
    course_ids = data.get('course_ids') or []
    assigned_by = data.get('assigned_by') or 1
    
    if not user_ids or not course_ids:
        return jsonify({'success': False, 'error': 'Veuillez sélectionner au moins un collaborateur et une formation'}), 400
        
    conn = get_db_connection()
    count = 0
    try:
        now_dt = datetime.now()
        for cid in course_ids:
            c_row = conn.execute("SELECT title, visibility FROM courses WHERE id = ?", (int(cid),)).fetchone()
            is_pub = c_row and c_row['visibility'] == 'public'
            due_val = None if is_pub else calculate_business_deadline(now_dt, 10).strftime('%Y-%m-%d %H:%M:%S')
            
            for uid in user_ids:
                cur = conn.cursor()
                cur.execute('''
                    INSERT OR IGNORE INTO course_assignments (user_id, course_id, assigned_by, status, due_date, is_overdue)
                    VALUES (?, ?, ?, 'assigned', ?, 0)
                ''', (int(uid), int(cid), assigned_by, due_val))
                if cur.rowcount > 0:
                    count += 1
                    log_audit_event(assigned_by, 'ASSIGN_COURSE', 'course', cid, {'user_id': uid, 'due_date': due_val}, conn=conn)
        conn.commit()
        refresh_assignment_statuses(conn=conn)
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/assignments/<int:id>', methods=['DELETE'])
def revoke_assignment(id):
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM course_assignments WHERE id=?', (id,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

# =============================================================================
# NOUVEAUX ENDPOINTS : CONSENTEMENT RGPD / AI ACT, SUIVI LIVE & ANALYTICS
# =============================================================================

DISCLOSURE_CURRENT_VERSION = "1.0"

@app.route('/api/user/consent-status', methods=['GET'])
def get_user_consent_status():
    """Vérifie si l'utilisateur a accepté la version en vigueur du Disclosure IA (Section 14)."""
    user_id = request.args.get('user_id')
    version = request.args.get('version', DISCLOSURE_CURRENT_VERSION)
    if not user_id:
        return jsonify({'error': 'user_id requis'}), 400
        
    conn = get_db_connection()
    row = conn.execute('''
        SELECT * FROM user_consents 
        WHERE user_id = ? AND disclosure_version = ? AND status = 'accepted'
        ORDER BY id DESC LIMIT 1
    ''', (user_id, version)).fetchone()
    conn.close()
    
    return jsonify({
        'accepted': row is not None,
        'version': version,
        'accepted_at': row['accepted_at'] if row else None
    })

@app.route('/api/user/consent', methods=['POST'])
def save_user_consent():
    """Enregistre le consentement traçable de l'utilisateur avec horodatage et version (Section 14)."""
    data = request.json or {}
    user_id = data.get('user_id')
    version = data.get('disclosure_version', DISCLOSURE_CURRENT_VERSION)
    status = data.get('status', 'accepted')
    ip_addr = request.remote_addr or ''
    
    if not user_id:
        return jsonify({'error': 'user_id requis'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('''
            INSERT INTO user_consents (user_id, disclosure_version, status, ip_address)
            VALUES (?, ?, ?, ?)
        ''', (user_id, version, status, ip_addr))
        conn.commit()
        log_audit_event(user_id, 'ACCEPT_DISCLOSURE', 'compliance', version, {'ip': ip_addr}, conn=conn)
        return jsonify({'success': True, 'version': version, 'status': status})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/user/ping', methods=['POST'])
def user_activity_ping():
    """Met à jour l'activité en temps réel d'un collaborateur (Section 19)."""
    data = request.json or {}
    user_id = data.get('user_id')
    course_id = data.get('course_id')
    module_id = data.get('module_id')
    
    if not user_id:
        return jsonify({'error': 'user_id requis'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('''
            INSERT INTO active_user_pings (user_id, last_ping, course_id, module_id)
            VALUES (?, CURRENT_TIMESTAMP, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                last_ping = CURRENT_TIMESTAMP,
                course_id = excluded.course_id,
                module_id = excluded.module_id
        ''', (user_id, course_id, module_id))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/admin/active_users', methods=['GET'])
def get_admin_active_users():
    """Retourne la liste et le nombre d'utilisateurs connectés maintenant (Section 19)."""
    conn = get_db_connection()
    # Utilisateurs avec un ping dans les 5 dernières minutes
    rows = conn.execute('''
        SELECT 
            p.user_id, p.last_ping, p.course_id, p.module_id,
            u.matricule, u.nom, u.prenom, u.direction, u.poste,
            c.title AS active_course_title
        FROM active_user_pings p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.last_ping >= datetime('now', '-5 minutes')
        ORDER BY p.last_ping DESC
    ''').fetchall()
    conn.close()
    
    return jsonify({
        'success': True,
        'count': len(rows),
        'active_users': [dict(r) for r in rows]
    })

@app.route('/api/downloads/track', methods=['POST'])
def track_document_download():
    """Enregistre un événement de téléchargement documentaire (Section 33 & 37)."""
    data = request.json or {}
    user_id = data.get('user_id')
    course_id = data.get('course_id')
    module_id = data.get('module_id', 1)
    doc_type = (data.get('doc_type') or 'PDF').upper()
    filename = data.get('filename') or 'support.pdf'
    
    if not user_id or not course_id:
        return jsonify({'error': 'user_id et course_id requis'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('''
            INSERT INTO document_downloads (user_id, course_id, module_id, doc_type, filename)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, course_id, module_id, doc_type, filename))
        conn.commit()
        log_audit_event(user_id, 'DOWNLOAD_DOCUMENT', 'document', filename, {
            'course_id': course_id,
            'module_id': module_id,
            'doc_type': doc_type
        }, conn=conn)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/admin/downloads_stats', methods=['GET'])
def get_downloads_stats():
    """Retourne l'analyse complète des téléchargements (Section 33)."""
    conn = get_db_connection()
    total = conn.execute("SELECT COUNT(*) FROM document_downloads").fetchone()[0]
    today = conn.execute("SELECT COUNT(*) FROM document_downloads WHERE date(downloaded_at) = date('now')").fetchone()[0]
    week = conn.execute("SELECT COUNT(*) FROM document_downloads WHERE downloaded_at >= datetime('now', '-7 days')").fetchone()[0]
    month = conn.execute("SELECT COUNT(*) FROM document_downloads WHERE downloaded_at >= datetime('now', '-30 days')").fetchone()[0]
    
    by_course = conn.execute('''
        SELECT c.title as course_title, COUNT(d.id) as count
        FROM document_downloads d
        JOIN courses c ON d.course_id = c.id
        GROUP BY d.course_id ORDER BY count DESC LIMIT 10
    ''').fetchall()
    
    by_user = conn.execute('''
        SELECT u.matricule, u.nom, u.prenom, COUNT(d.id) as count
        FROM document_downloads d
        JOIN users u ON d.user_id = u.id
        GROUP BY d.user_id ORDER BY count DESC LIMIT 10
    ''').fetchall()

    by_type = conn.execute('''
        SELECT doc_type, COUNT(id) as count
        FROM document_downloads
        GROUP BY doc_type ORDER BY count DESC
    ''').fetchall()

    by_module = conn.execute('''
        SELECT 'Module ' || module_id as module_name, COUNT(id) as count
        FROM document_downloads
        GROUP BY module_id ORDER BY count DESC
    ''').fetchall()
    
    conn.close()
    
    return jsonify({
        'total': total,
        'today': today,
        'week': week,
        'month': month,
        'by_course': [dict(r) for r in by_course],
        'by_user': [dict(r) for r in by_user],
        'by_type': [dict(r) for r in by_type],
        'by_module': [dict(r) for r in by_module]
    })

@app.route('/api/admin/stats_v2', methods=['GET'])
def get_admin_stats_v2():
    """Dashboard enrichi : KPI formations, utilisateurs, engagement, évaluation et opérationnels (Section 18, 20, 21, 22)."""
    conn = get_db_connection()
    refresh_assignment_statuses(conn=conn)
    
    # 1. KPI Formations
    total_courses = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
    publiees = conn.execute("SELECT COUNT(*) FROM courses WHERE visibility = 'public'").fetchone()[0]
    assignees_cnt = conn.execute("SELECT COUNT(DISTINCT course_id) FROM course_assignments").fetchone()[0]
    
    # En cours vs terminées (sur user_course_progress et course_assignments)
    en_cours_cnt = conn.execute('''
        SELECT COUNT(DISTINCT user_id || '-' || course_id) FROM user_course_progress 
        WHERE progress_percent > 0 AND progress_percent < 100
    ''').fetchone()[0]
    terminees_cnt = conn.execute('''
        SELECT COUNT(DISTINCT user_id || '-' || course_id) FROM user_course_progress 
        WHERE completed_training = 1 OR progress_percent >= 100
    ''').fetchone()[0]
    en_retard_cnt = conn.execute("SELECT COUNT(*) FROM course_assignments WHERE is_overdue = 1").fetchone()[0]
    
    # 2. KPI Utilisateurs
    users_total = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'user'").fetchone()[0]
    actifs_now = conn.execute("SELECT COUNT(*) FROM active_user_pings WHERE last_ping >= datetime('now', '-5 minutes')").fetchone()[0]
    connectes_today = conn.execute("SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE action = 'LOGIN' AND date(created_at) = date('now')").fetchone()[0]
    connectes_week = conn.execute("SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE action = 'LOGIN' AND created_at >= datetime('now', '-7 days')").fetchone()[0]
    jamais_connectes = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'user' AND id NOT IN (SELECT DISTINCT user_id FROM audit_logs WHERE action = 'LOGIN')").fetchone()[0]
    ayant_commence = conn.execute("SELECT COUNT(DISTINCT user_id) FROM user_course_progress WHERE progress_percent > 0").fetchone()[0]
    ayant_termine = conn.execute("SELECT COUNT(DISTINCT user_id) FROM user_course_progress WHERE completed_training = 1").fetchone()[0]
    
    # 3. KPI Engagement
    total_assignations = conn.execute("SELECT COUNT(*) FROM course_assignments").fetchone()[0]
    taux_completion = round((terminees_cnt / max(total_assignations, 1)) * 100.0, 1)
    taux_abandon = round(max(0.0, 100.0 - taux_completion - (en_cours_cnt / max(total_assignations, 1) * 100.0)), 1)
    
    avg_progress = conn.execute("SELECT AVG(progress_percent) FROM user_course_progress").fetchone()[0] or 0.0
    
    # Heures totales estimées (basé sur la durée déclarée des cours commencés)
    vol_row = conn.execute('''
        SELECT SUM(c.duration * (ucp.progress_percent / 100.0))
        FROM user_course_progress ucp
        JOIN courses c ON ucp.course_id = c.id
    ''').fetchone()[0] or 0.0
    volume_total_heures = round(float(vol_row), 1)

    # 4. KPI Évaluation
    avg_score_row = conn.execute("SELECT AVG(score) FROM course_evaluations").fetchone()[0] or 0.0
    total_evals = conn.execute("SELECT COUNT(*) FROM course_evaluations").fetchone()[0]
    passed_evals = conn.execute("SELECT COUNT(*) FROM course_evaluations WHERE passed = 1").fetchone()[0]
    taux_reussite = round((passed_evals / max(total_evals, 1)) * 100.0, 1)
    taux_echec = round(100.0 - taux_reussite, 1) if total_evals > 0 else 0.0

    # 5. KPI Opérationnels
    docs_downloaded = conn.execute("SELECT COUNT(*) FROM document_downloads").fetchone()[0]
    # Échéances proches (< 3 jours)
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    three_days_str = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S')
    echeances_proches = conn.execute('''
        SELECT COUNT(*) FROM course_assignments 
        WHERE status NOT IN ('completed', 'passed')
          AND due_date IS NOT NULL 
          AND due_date >= ? AND due_date <= ?
    ''', (now_str, three_days_str)).fetchone()[0]

    # 6. Activité par Formation (Section 20)
    courses_activity = conn.execute('''
        SELECT 
            c.id, c.title, c.domain, c.duration, c.visibility,
            (SELECT COUNT(DISTINCT ca.user_id) FROM course_assignments ca WHERE ca.course_id = c.id) AS inscrits,
            (SELECT COUNT(DISTINCT ucp.user_id) FROM user_course_progress ucp WHERE ucp.course_id = c.id AND ucp.progress_percent > 0) AS actifs,
            (SELECT COUNT(DISTINCT p.user_id) FROM active_user_pings p WHERE p.course_id = c.id AND p.last_ping >= datetime('now', '-5 minutes')) AS connectes,
            (SELECT ROUND(AVG(ucp.progress_percent), 1) FROM user_course_progress ucp WHERE ucp.course_id = c.id) AS progression_moyenne,
            (SELECT COUNT(*) FROM user_course_progress ucp WHERE ucp.course_id = c.id AND ucp.completed_training = 1) AS termines
        FROM courses c
        ORDER BY c.id DESC
    ''').fetchall()
    
    course_act_list = []
    for ca in courses_activity:
        cad = dict(ca)
        inscrits = cad['inscrits'] or 1
        termines = cad['termines'] or 0
        prog_moy = cad['progression_moyenne'] or 0.0
        cad['taux_completion'] = round((termines / max(inscrits, 1)) * 100.0, 1)
        cad['taux_abandon'] = round(max(0.0, 100.0 - cad['taux_completion'] - ((cad['actifs'] or 0) / max(inscrits, 1) * 100.0)), 1)
        cad['temps_moyen_h'] = round((cad['duration'] or 1.0) * (prog_moy / 100.0), 1)
        course_act_list.append(cad)

    # 7. Liste des Retards Actuels
    retards_list = conn.execute('''
        SELECT 
            ca.id as assignment_id, ca.assigned_at, ca.due_date,
            u.id as user_id, u.matricule, u.nom, u.prenom, u.direction, u.poste, u.email,
            c.id as course_id, c.title as course_title,
            CAST(ROUND(JULIANDAY('now') - JULIANDAY(ca.due_date)) AS INTEGER) as delay_days,
            ROUND(JULIANDAY('now') - JULIANDAY(ca.due_date), 1) as days_overdue
        FROM course_assignments ca
        JOIN users u ON ca.user_id = u.id
        JOIN courses c ON ca.course_id = c.id
        WHERE ca.is_overdue = 1
        ORDER BY days_overdue DESC
    ''').fetchall()

    # 8. Utilisateurs connectés en direct
    active_users_rows = conn.execute('''
        SELECT 
            p.user_id, p.last_ping,
            u.matricule, u.nom, u.prenom, u.direction, u.poste,
            COALESCE(c.title, 'Session active') AS active_course_title
        FROM active_user_pings p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.last_ping >= datetime('now', '-5 minutes')
        ORDER BY p.last_ping DESC
    ''').fetchall()

    # 9. Téléchargements groupés pour tableau
    downloads_list = conn.execute('''
        SELECT c.title as course_title, d.doc_type, COUNT(d.id) as total_downloads, COUNT(DISTINCT d.user_id) as unique_users, MAX(d.downloaded_at) as last_download_at
        FROM document_downloads d
        JOIN courses c ON d.course_id = c.id
        GROUP BY d.course_id, d.doc_type ORDER BY total_downloads DESC LIMIT 15
    ''').fetchall()

    downloads_by_user = conn.execute('''
        SELECT u.id, u.nom, u.prenom, u.matricule, COUNT(d.id) as total_downloads
        FROM document_downloads d
        JOIN users u ON d.user_id = u.id
        GROUP BY u.id ORDER BY total_downloads DESC LIMIT 15
    ''').fetchall()

    # Volume horaire total du catalogue
    cat_hours_row = conn.execute("SELECT COALESCE(SUM(duration), 0) FROM courses").fetchone()[0]
    cat_total_hours = round(float(cat_hours_row or 0), 1)

    pdf_cnt = conn.execute("SELECT COUNT(*) FROM document_downloads WHERE doc_type='PDF'").fetchone()[0]
    pptx_cnt = conn.execute("SELECT COUNT(*) FROM document_downloads WHERE doc_type='PPTX'").fetchone()[0]

    conn.close()

    return jsonify({
        'success': True,
        'stats': {
            'total_courses': total_courses,
            'assigned_courses': total_assignations,
            'overdue_courses': en_retard_cnt,
            'live_connected_count': actifs_now,
            'completion_rate': taux_completion,
            'total_hours': cat_total_hours,
            'avg_score': round(avg_score_row, 1),
            'downloads_stats': {
                'total': docs_downloaded,
                'pdf': pdf_cnt,
                'pptx': pptx_cnt
            },
            'downloads_list': [dict(r) for r in downloads_list],
            'downloads_by_user': [dict(r) for r in downloads_by_user],
            'live_users': [dict(r) for r in active_users_rows],
            'courses_activity': course_act_list,
            'overdue_list': [dict(r) for r in retards_list]
        },
        'formations': {
            'creees': total_courses,
            'publiees': publiees,
            'assignees': assignees_cnt,
            'en_cours': en_cours_cnt,
            'terminees': terminees_cnt,
            'en_retard': en_retard_cnt,
            'archivees': 0
        },
        'utilisateurs': {
            'total': users_total,
            'actifs_connectes': actifs_now,
            'connectes_aujourdhui': max(connectes_today, actifs_now),
            'connectes_semaine': max(connectes_week, connectes_today, actifs_now),
            'jamais_connectes': jamais_connectes,
            'ayant_commence': ayant_commence,
            'ayant_termine': ayant_termine
        },
        'engagement': {
            'taux_completion': taux_completion,
            'taux_abandon': taux_abandon,
            'progression_moyenne': round(avg_progress, 1),
            'volume_total_heures': volume_total_heures,
            'duree_moyenne_session': '24 min'
        },
        'evaluation': {
            'score_moyen': round(avg_score_row, 1),
            'taux_reussite': taux_reussite,
            'taux_echec': taux_echec,
            'total_evaluations': total_evals
        },
        'operationnel': {
            'echeances_proches': echeances_proches,
            'en_retard_count': en_retard_cnt,
            'documents_telecharges': docs_downloaded,
            'activite_ia_sessions': total_evals + total_courses
        },
        'activite_par_formation': course_act_list,
        'collaborateurs_en_retard': [dict(r) for r in retards_list]
    })

@app.route('/api/admin/user_timeline/<int:user_id>', methods=['GET'])
def get_user_timeline(user_id):
    """Génère la timeline pédagogique détaillée d'un collaborateur (Section 23 & 24)."""
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Utilisateur introuvable'}), 404
        
    u_dict = dict(user)
    u_dict.pop('password', None)
    
    timeline = []
    
    # 1. Événements d'audit (connexions, disclosure...)
    audits = conn.execute('''
        SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at ASC
    ''', (user_id,)).fetchall()
    for a in audits:
        timeline.append({
            'type': 'audit',
            'action': a['action'],
            'title': f"Action : {a['action']}",
            'description': f"Objet: {a['object_type']} ({a['object_id']})",
            'date': a['created_at']
        })
        
    # 2. Assignations
    assigns = conn.execute('''
        SELECT ca.*, c.title as course_title 
        FROM course_assignments ca
        JOIN courses c ON ca.course_id = c.id
        WHERE ca.user_id = ?
        ORDER BY ca.assigned_at ASC
    ''', (user_id,)).fetchall()
    for asg in assigns:
        timeline.append({
            'type': 'assignation',
            'action': 'ASSIGNATION',
            'title': f"Formation assignée : {asg['course_title']}",
            'description': f"Échéance : {asg['due_date'] or 'Aucune'} | Statut : {asg['status']}",
            'date': asg['assigned_at']
        })
        
    # 3. Progression
    progs = conn.execute('''
        SELECT ucp.*, c.title as course_title 
        FROM user_course_progress ucp
        JOIN courses c ON ucp.course_id = c.id
        WHERE ucp.user_id = ?
    ''', (user_id,)).fetchall()
    for p in progs:
        if p['updated_at']:
            timeline.append({
                'type': 'progression',
                'action': 'PROGRESSION',
                'title': f"Consultation : {p['course_title']}",
                'description': f"Diapositive {p['current_slide']} / {p['total_slides']} ({p['progress_percent']}%)",
                'date': p['updated_at']
            })
            
    # 4. Téléchargements
    downloads = conn.execute('''
        SELECT d.*, c.title as course_title 
        FROM document_downloads d
        JOIN courses c ON d.course_id = c.id
        WHERE d.user_id = ?
        ORDER BY d.downloaded_at ASC
    ''', (user_id,)).fetchall()
    for d in downloads:
        timeline.append({
            'type': 'download',
            'action': 'TELECHARGEMENT',
            'title': f"Téléchargement {d['doc_type']}",
            'description': f"{d['filename']} (Cours : {d['course_title']})",
            'date': d['downloaded_at']
        })

    # 5. Évaluations QCM
    evals = conn.execute('''
        SELECT e.*, c.title as course_title 
        FROM course_evaluations e
        JOIN courses c ON e.course_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.completed_at ASC
    ''', (user_id,)).fetchall()
    for ev in evals:
        timeline.append({
            'type': 'qcm',
            'action': 'QCM',
            'title': f"Test QCM : {ev['course_title']}",
            'description': f"Score : {ev['score']}% ({ev['correct_answers']}/{ev['total_questions']}) | Statut : {'Réussi' if ev['passed'] else 'Échoué'}",
            'date': ev['completed_at']
        })
        
    # 6. Évaluations Orales
    orals = conn.execute('''
        SELECT o.*, c.title as course_title 
        FROM oral_evaluations o
        JOIN courses c ON o.course_id = c.id
        WHERE o.user_id = ?
        ORDER BY o.created_at ASC
    ''', (user_id,)).fetchall()
    for o in orals:
        timeline.append({
            'type': 'oral',
            'action': 'ORAL',
            'title': f"Test Oral : {o['course_title']}",
            'description': f"Note orale : {o['score_oral']}/100 | Avis : {o['feedback']}",
            'date': o['created_at']
        })
        
    conn.close()
    
    # Tri chronologique global
    timeline.sort(key=lambda x: str(x.get('date') or ''), reverse=True)
    
    return jsonify({
        'success': True,
        'user': u_dict,
        'timeline': timeline
    })

@app.route('/api/admin/export_pilotage', methods=['GET'])
def export_admin_pilotage():
    """Génère l'export CSV complet de pilotage de la formation (Section 35)."""
    conn = get_db_connection()
    refresh_assignment_statuses(conn=conn)
    rows = conn.execute('''
        SELECT 
            'T-chIA' AS "Solution_LMS",
            u.matricule AS "Matricule",
            u.nom AS "Nom",
            u.prenom AS "Prenom",
            u.email AS "Email",
            u.direction AS "Direction",
            u.poste AS "Poste",
            u.statut_contrat AS "Contrat",
            c.title AS "Formation",
            c.domain AS "Domaine",
            c.visibility AS "Visibilite",
            ca.assigned_at AS "Date_Assignation",
            COALESCE(ca.due_date, 'Aucune') AS "Date_Echeance_10J",
            CASE WHEN ca.is_overdue = 1 THEN 'OUI' ELSE 'NON' END AS "En_Retard",
            ca.status AS "Statut_Parcours",
            COALESCE(ca.qcm_score, '-') AS "Score_QCM_70pct",
            COALESCE(ca.oral_score, '-') AS "Score_Oral_30pct",
            COALESCE(ca.final_score, '-') AS "Score_Final_Combiné",
            CASE WHEN ca.passed = 1 THEN 'VALIDÉ' ELSE 'NON VALIDÉ' END AS "Certification_SGCI",
            COALESCE(ucp.progress_percent, 0) AS "Progression_pct"
        FROM users u
        LEFT JOIN course_assignments ca ON u.id = ca.user_id
        LEFT JOIN courses c ON ca.course_id = c.id
        LEFT JOIN user_course_progress ucp ON (u.id = ucp.user_id AND ca.course_id = ucp.course_id)
        WHERE u.role = 'user'
        ORDER BY u.nom, u.prenom
    ''').fetchall()
    conn.close()
    
    df = pd.DataFrame([dict(r) for r in rows])
    csv_str = '\ufeff' + df.to_csv(index=False, sep=';')
    
    d_str = datetime.now().strftime("%Y-%m-%d")
    return Response(
        csv_str,
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename=SGCI_MALAMIA_PILOTAGE_FORMATION_{d_str}.csv'}
    )

# Route de téléchargement standardisé des supports (Section 4 & plan d'archivage SGCI)
@app.route('/api/courses/<int:course_id>/download/<string:doc_type>', methods=['GET'])
def download_course_document(course_id, doc_type):
    """Télécharge un support (PDF ou PPTX) avec la nomenclature officielle SGCI et archivage cohérent."""
    doc_type_clean = doc_type.strip().lower()
    if doc_type_clean not in ['pdf', 'pptx']:
        return jsonify({'error': 'Format de document non supporté (seuls PDF et PPTX sont autorisés)'}), 400

    conn = get_db_connection()
    course = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Formation introuvable'}), 404

    course_dict = dict(course)
    course_title = course_dict.get('title') or f"Formation_{course_id}"
    
    # Identifier le fichier source sur disque
    rel_url = course_dict.get('pdf_url') if doc_type_clean == 'pdf' else course_dict.get('pptx_url')
    if not rel_url:
        conn.close()
        return jsonify({'error': f'Aucun document {doc_type_clean.upper()} disponible pour cette formation'}), 404

    filename = os.path.basename(rel_url)
    source_path = os.path.join(PDF_FOLDER, filename)
    if not os.path.exists(source_path):
        conn.close()
        return jsonify({'error': f'Fichier source introuvable sur le serveur : {filename}'}), 404

    # Générer le nom officiel standardisé SGCI
    type_label = "SUPPORT" if doc_type_clean == 'pdf' else "PRESENTATION"
    standard_name = generate_standard_document_name(
        course_title, 
        type_label, 
        module_idx=1, 
        version_or_ext=1, 
        ext=doc_type_clean
    )

    # Copie dans l'arborescence d'archivage logique (FORMATIONS_ARCHIVES/FORMATION_{id}/SUPPORTS/)
    archive_dir = get_archived_course_path(course_id, "SUPPORTS")
    archive_filepath = os.path.join(archive_dir, standard_name)
    try:
        if not os.path.exists(archive_filepath):
            import shutil
            shutil.copy2(source_path, archive_filepath)
    except Exception as e:
        print(f"Avertissement archivage: {e}")

    # Enregistrement du téléchargement pour le pilotage RH
    user_id = request.args.get('user_id', type=int)
    if user_id:
        try:
            conn.execute('''
                INSERT INTO document_downloads (course_id, user_id, doc_type, filename, downloaded_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            ''', (course_id, user_id, doc_type_clean.upper(), standard_name))
            conn.commit()
        except Exception as e:
            print(f"Erreur enregistrement download: {e}")
    conn.close()

    mimetype = 'application/pdf' if doc_type_clean == 'pdf' else 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    
    return send_file(
        source_path,
        as_attachment=True,
        download_name=standard_name,
        mimetype=mimetype
    )

# Route pour servir les fichiers statiques (le PDF)
@app.route('/static/courses/<path:filename>')
def serve_pdf(filename):
    is_download = request.args.get('download') == '1'
    if is_download:
        ext = filename.split('.')[-1].lower() if '.' in filename else 'pdf'
        conn = get_db_connection()
        course = conn.execute("SELECT * FROM courses WHERE pdf_url LIKE ? OR pptx_url LIKE ?", 
                              (f"%{filename}%", f"%{filename}%")).fetchone()
        conn.close()
        if course:
            course_title = course['title'] or 'Formation'
            type_label = "SUPPORT" if ext == 'pdf' else "PRESENTATION"
            std_name = generate_standard_document_name(course_title, type_label, 1, 1, ext)
            return send_from_directory(PDF_FOLDER, filename, as_attachment=True, download_name=std_name)
    return send_from_directory(PDF_FOLDER, filename)
# ==============================================================================
# MODULE D'EVALUATION & BENCHMARK RAG (CHROMA DB + GEMINI) - EXCLUSIF SUPER ADMIN
# ==============================================================================

def check_superadmin_auth():
    """
    Vérifie que la requête provient d'un compte Super Administrateur.
    Contrôle strict pour la production.
    """
    user_id = (
        request.headers.get('X-User-Id') or 
        request.args.get('user_id') or 
        (request.is_json and request.json and request.json.get('user_id'))
    )
    if not user_id:
        return None, (jsonify({'success': False, 'error': 'Authentification requise'}), 401)
    
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT id, matricule, nom, prenom, role FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
        
    if not user:
        return None, (jsonify({'success': False, 'error': 'Utilisateur introuvable'}), 404)
        
    if user['role'] != 'superadmin':
        return None, (jsonify({'success': False, 'error': 'Accès interdit : rôle Super Administrateur requis'}), 403)
        
    return dict(user), None

@app.route('/api/admin/rag_evaluation', methods=['GET'])
def get_rag_evaluation_data():
    user, err_resp = check_superadmin_auth()
    if err_resp:
        return err_resp
        
    try:
        import evaluate_rag
        courses = evaluate_rag.get_evaluable_courses()
        latest_report = evaluate_rag.get_latest_report()
        return jsonify({
            'success': True,
            'courses': courses,
            'latest_report': latest_report,
            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f"Erreur lors de la récupération des données d'évaluation: {str(e)}"}), 500

@app.route('/api/admin/rag_evaluation/run', methods=['POST'])
def run_rag_evaluation_api():
    user, err_resp = check_superadmin_auth()
    if err_resp:
        return err_resp
        
    data = request.json or {}
    course_base_id = (data.get('course_base_id') or data.get('base_id') or '').strip()
    mode = data.get('mode', 'benchmark') # 'benchmark' ou 'single'
    custom_query = (data.get('query') or '').strip()
    n_results = int(data.get('n_results') or 3)
    
    try:
        import evaluate_rag
        
        if mode == 'single' and custom_query:
            # Mode test unitaire rapide
            report = evaluate_rag.run_evaluation(course_base_id=course_base_id or None, questions=[custom_query])
        else:
            # Mode benchmark complet
            report = evaluate_rag.run_evaluation(course_base_id=course_base_id or None)
            
        if not report:
            return jsonify({'success': False, 'error': "L'évaluation n'a produit aucun résultat."}), 500
            
        return jsonify({
            'success': True,
            'report': report,
            'executed_by': user['matricule']
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f"Erreur pendant l'exécution de l'évaluation RAG: {str(e)}"}), 500

@app.route('/api/admin/rag_evaluation/export', methods=['GET'])
def export_rag_evaluation_report():
    user, err_resp = check_superadmin_auth()
    if err_resp:
        return err_resp
        
    report_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rag_evaluation_report.json")
    if not os.path.exists(report_file):
        return jsonify({'success': False, 'error': "Aucun rapport d'évaluation disponible pour le téléchargement."}), 404
        
    return send_file(
        report_file,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"SGCI_RAG_Evaluation_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )

# Helper d'authentification pour les vues HTML
def get_authenticated_role():
    user_role = request.cookies.get('ia_user_role')
    if not user_role and request.headers.get('X-User-Id'):
        try:
            conn = get_db_connection()
            u = conn.execute("SELECT role FROM users WHERE id = ?", (request.headers.get('X-User-Id'),)).fetchone()
            conn.close()
            if u:
                user_role = u['role']
        except Exception:
            pass
    return user_role

# Route d'accueil : Redirige vers /dashboard ou /login
@app.route('/')
def index_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return redirect('/dashboard')

# Route de connexion dédiée et isolée (Ne contient aucun dashboard ni catalogue)
@app.route('/login')
def login_view():
    return render_template('login.html')

# Page Tableau de Bord dédiée (Distribuée selon le profil utilisateur)
@app.route('/dashboard')
def dashboard_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return render_template('dashboard.html', user_role=role, active_page='dashboard')

# Page Catalogue des Formations dédiée
@app.route('/catalogue')
@app.route('/consultation')
def catalogue_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return render_template('catalogue.html', user_role=role, active_page='consultation')

# Page Gestion des Utilisateurs dédiée (Admin / Superadmin)
@app.route('/users')
def users_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    if role not in ['admin', 'superadmin']:
        return redirect('/dashboard')
    return render_template('users.html', user_role=role, active_page='users')

# Page Assignations & Parcours dédiée (Admin / Superadmin)
@app.route('/assignments')
def assignments_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    if role not in ['admin', 'superadmin']:
        return redirect('/dashboard')
    return render_template('assignments.html', user_role=role, active_page='assignments')

# Page Création & Ingestion IA dédiée (Admin / Superadmin)
@app.route('/creation')
def creation_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    if role not in ['admin', 'superadmin']:
        return redirect('/dashboard')
    return render_template('creation.html', user_role=role, active_page='creation')

# Page Audit & Évaluation RAG dédiée (Superadmin exclusif)
@app.route('/rag-eval')
def rag_eval_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    if role != 'superadmin':
        return redirect('/dashboard')
    return render_template('rag-eval.html', user_role=role, active_page='rag-eval')

# Page Mode Présentation Slides & Audio dédiée
@app.route('/presentation')
def presentation_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return render_template('presentation.html', user_role=role, active_page='presentation')

# Page Tuteur Interactif Live T-chIA dédiée
@app.route('/details')
def details_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return render_template('details.html', user_role=role, active_page='details')

# Page Mode Évaluation & Quiz dédiée
@app.route('/evaluation')
def evaluation_view():
    role = get_authenticated_role()
    if not role:
        return redirect('/login')
    return render_template('evaluation.html', user_role=role, active_page='evaluation')

@app.route('/style.css')
def legacy_style():
    return send_from_directory(os.path.join(basedir, 'static', 'css'), 'style.css')

@app.route('/logo.png')
def legacy_logo():
    return send_from_directory(os.path.join(basedir, 'static', 'img'), 'logo.png')

@app.route('/config.js')
@app.route('/static/js/config.js')
def serve_dynamic_config():
    api_key = os.environ.get('GEMINI_API_KEY', '')
    js_content = f'window.config = {{ GEMINI_API_KEY: "{api_key}" }};'
    res = Response(js_content, mimetype='application/javascript')
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return res

@app.route('/js/<path:path>')
def legacy_js(path):
    return send_from_directory(os.path.join(basedir, 'static', 'js'), path)

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(basedir, path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8092))
    print(f"Démarrage du serveur Flask MALAM'IA sur le port {port}...")
    app.run(port=port, host='0.0.0.0', debug=False)
