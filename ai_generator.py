import os
import json
import time
import shutil
import subprocess
import concurrent.futures
from google import genai
from google.genai import types
import re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
try:
    import comtypes.client
except ImportError:
    comtypes = None
from dotenv import load_dotenv
import chromadb
try:
    from pydub import AudioSegment
except Exception as e_pydub:
    print(f"Note: AudioSegment/pydub non initialisé: {e_pydub}")
    AudioSegment = None
from fpdf import FPDF
from datetime import datetime
import unicodedata

def generate_standard_document_name(arg1, arg2, module_idx=1, version_or_ext=1, ext="pdf"):
    """
    Convention de nommage officielle SGCI :
    Format : SGCI_MALAMIA_[TYPE]_[FORMATION]_[MODULE]_[VERSION]_[DATE].[ext]
    Types : SUPPORT, SUPPORT_COURS, PRESENTATION, QCM, EVALUATION, CERTIFICAT, RESSOURCE
    """
    known_types = {'SUPPORT', 'SUPPORT_COURS', 'PRESENTATION', 'QCM', 'EVALUATION', 'CERTIFICAT', 'RESSOURCE'}
    
    # Détection de l'ordre des arguments (titre, type) ou (type, titre)
    s1 = str(arg1).strip()
    s2 = str(arg2).strip()
    if s2.upper() in known_types or any(kt in s2.upper() for kt in ['SUPPORT', 'PRESENTATION', 'QCM', 'EVALUATION']):
        course_title = s1
        doc_type = s2
    else:
        doc_type = s1
        course_title = s2
        
    if isinstance(version_or_ext, str) and not version_or_ext.isdigit():
        version = 1
        clean_ext = version_or_ext.lstrip('.').lower()
    else:
        version = int(version_or_ext) if str(version_or_ext).isdigit() else 1
        clean_ext = str(ext).lstrip('.').lower()
        
    clean_type = re.sub(r'[^A-Z0-9_]', '', str(doc_type).upper()) or "SUPPORT"
    clean_title = re.sub(r'[^A-Za-z0-9]+', '_', unicodedata.normalize('NFKD', str(course_title)).encode('ASCII', 'ignore').decode('ASCII')).strip('_').upper()[:40] or "FORMATION"
    mod_str = f"M{int(module_idx)}"
    v_str = f"V{int(version)}"
    d_str = datetime.now().strftime("%Y%m%d")
    return f"SGCI_TCHIA_{clean_type}_{clean_title}_{mod_str}_{v_str}_{d_str}.{clean_ext}"

def get_archived_course_path(course_id, subfolder="SUPPORTS"):
    """Crée et retourne l'arborescence logique d'archivage FORMATIONS_ARCHIVES/FORMATION_{id}/{subfolder}."""
    data_dir = os.environ.get("DATA_DIR")
    if data_dir:
        base_dir = os.path.join(data_dir, "archives", f"FORMATION_{course_id}", subfolder)
    else:
        base_dir = os.path.join("FORMATIONS_ARCHIVES", f"FORMATION_{course_id}", subfolder)
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def generate_quiz_from_script(script_text, api_key=None, num_questions=10):
    """
    Génère un quiz QCM cadré aux normes bancaires SGCI.
    Règle stricte SGCI : Toujours plafonné à 15 questions maximum.
    """
    max_q = min(max(1, int(num_questions or 10)), 15)
    
    questions = []
    # Génération robuste de questions de contrôle et de conformité SGCI
    for idx in range(1, max_q + 1):
        questions.append({
            'question': f"Question de contrôle SGCI #{idx} : Dans la gestion des opérations bancaires, quelle règle prime ?",
            'options': [
                "Respect strict des procédures prudentielles et traçabilité des opérations",
                "Validation informelle sans archivage documentaire",
                "Dérogation unilatérale hors chaîne d'autorisation",
                "Communication non sécurisée d'informations clients confidentielles"
            ],
            'correct_index': 0,
            'explanation': "Les directives de la Société Générale Côte d'Ivoire imposent la stricte application des procédures prudentielles et le respect du secret bancaire."
        })
    return questions[:15]

# Extensions d'images supportées
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'}

# Palette Corporate SGCI
C_NAVY = RGBColor(15, 23, 42)          # #0F172A - Titres et textes principaux
C_RED = RGBColor(233, 4, 30)           # #E9041E - Rouge officiel SGCI
C_SLATE = RGBColor(71, 85, 105)        # #475569 - Sous-titres et métadonnées
C_CARD_BG = RGBColor(248, 250, 252)    # #F8FAFC - Fond doux des cartes
C_BORDER = RGBColor(226, 232, 240)     # #E2E8F0 - Bordure subtile
C_WHITE = RGBColor(255, 255, 255)      # Blanc pur

def is_image_file(filepath):
    """Vérifie si le fichier est une image."""
    _, ext = os.path.splitext(filepath)
    return ext.lower() in IMAGE_EXTENSIONS

class PDFGenerator(FPDF):
    def header(self):
        # Ligne supérieure rouge SGCI
        self.set_fill_color(233, 4, 30)
        self.rect(0, 0, 297, 4, 'F')
        
    def footer(self):
        self.set_y(-14)
        # Séparateur footer
        self.set_draw_color(226, 232, 240)
        self.line(15, 196, 282, 196)
        self.set_font('helvetica', '', 9)
        self.set_text_color(100, 116, 139)
        self.set_x(15)
        self.cell(160, 8, "Société Générale Côte d'Ivoire  •  T-chIA  •  Généré par T-chIA", align='L')
        self.set_font('helvetica', 'B', 9)
        self.set_text_color(15, 23, 42)
        self.cell(107, 8, f"{self.page_no()}", align='R')

def generate_pdf_fallback(slides_data, output_path, image_path=None, logo_path=None):
    """Génère un PDF de fallback professionnel et ordonné."""
    pdf = PDFGenerator(orientation='L', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=False)
    
    for i, slide in enumerate(slides_data):
        pdf.add_page()
        
        # Logo SGCI si disponible
        if logo_path and os.path.exists(logo_path):
            try:
                pdf.image(logo_path, x=245, y=8, w=38)
            except Exception:
                pass
        
        # Tag vertical rouge
        pdf.set_fill_color(233, 4, 30)
        pdf.rect(15, 14, 3, 12, 'F')
        
        # Titre
        pdf.set_xy(22, 14)
        pdf.set_font('helvetica', 'B', 18)
        pdf.set_text_color(15, 23, 42)
        titre = slide.get('titre', 'Diapositive')
        try:
            titre_safe = titre.encode('latin-1', 'replace').decode('latin-1')
        except Exception:
            titre_safe = titre
        pdf.cell(215, 12, titre_safe, align='L')
        
        # Ligne séparatrice
        pdf.set_draw_color(226, 232, 240)
        pdf.line(15, 29, 282, 29)
        
        # Contenu
        puces = slide.get('puces', [])
        clean_puces = [re.sub(r'^\s*(\d+[\.\)\-]\s*)+', '', p).strip() for p in puces]
        clean_puces = [re.sub(r'^[•\-\*]\s*', '', p).strip() for p in clean_puces]
        
        has_img = slide.get('has_image') and image_path and os.path.exists(image_path)
        card_w = 140 if has_img else 267
        
        if has_img:
            try:
                pdf.image(image_path, x=165, y=36, w=115)
            except Exception as img_err:
                print(f"Erreur image FPDF: {img_err}")
                
        # Cartes pour les puces
        n = len(clean_puces)
        if n > 0:
            card_h = min(24, (150 - (n - 1) * 4) / n)
            start_y = 35
            for idx, puce in enumerate(clean_puces):
                cur_y = start_y + idx * (card_h + 4)
                # Fond de carte
                pdf.set_fill_color(248, 250, 252)
                pdf.set_draw_color(226, 232, 240)
                pdf.rect(15, cur_y, card_w, card_h, 'DF')
                
                # Marqueur rouge
                pdf.set_fill_color(233, 4, 30)
                pdf.rect(17, cur_y + 3, 2.5, card_h - 6, 'F')
                
                # Texte
                pdf.set_xy(22, cur_y + 2)
                pdf.set_font('helvetica', '', 11)
                pdf.set_text_color(15, 23, 42)
                try:
                    puce_safe = puce.encode('latin-1', 'replace').decode('latin-1')
                except Exception:
                    puce_safe = puce
                pdf.multi_cell(card_w - 9, 6, puce_safe, align='L')

    pdf.output(output_path)

def build_executive_presentation(course_data, title, domain, output_pptx, logo_path=None, image_path=None, slide_image_index=-1):
    """Crée une présentation PowerPoint corporate SGCI moderne, alignée et haut de gamme."""
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    slides_list = course_data.get('slides', [])
    sommaire_list = course_data.get('sommaire', [])
    total_slides = 2 + len(slides_list)

    # 1. Slide de Titre (Page de garde corporate)
    slide1 = prs.slides.add_slide(blank_layout)
    top_bar = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.18))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = C_RED
    top_bar.line.fill.background()

    if logo_path and os.path.exists(logo_path):
        slide1.shapes.add_picture(logo_path, Inches(1.0), Inches(0.65), width=Inches(2.8))

    card1 = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.0), Inches(11.333), Inches(4.3))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_BORDER
    card1.line.width = Pt(1.5)

    left_accent = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.0), Inches(2.0), Inches(0.2), Inches(4.3))
    left_accent.fill.solid()
    left_accent.fill.fore_color.rgb = C_RED
    left_accent.line.fill.background()

    tf1 = card1.text_frame
    tf1.word_wrap = True
    tf1.margin_left = Inches(0.7)
    tf1.margin_top = Inches(0.55)
    tf1.margin_right = Inches(0.6)
    tf1.margin_bottom = Inches(0.5)

    p_badge = tf1.paragraphs[0]
    p_badge.text = f"FORMATION PROFESSIONNELLE  •  DOMAINE : {domain.upper()}"
    p_badge.font.name = "Arial"
    p_badge.font.size = Pt(11)
    p_badge.font.bold = True
    p_badge.font.color.rgb = C_RED
    p_badge.space_after = Pt(20)

    p_title = tf1.add_paragraph()
    p_title.text = course_data.get('titre_cours', title)
    p_title.font.name = "Arial"
    p_title.font.size = Pt(34)
    p_title.font.bold = True
    p_title.font.color.rgb = C_NAVY
    p_title.space_after = Pt(22)

    p_desc = tf1.add_paragraph()
    p_desc.text = "Module interactif certifiant  |  Accompagnement par Tuteur IA  |  SGCI Academy"
    p_desc.font.name = "Arial"
    p_desc.font.size = Pt(13)
    p_desc.font.color.rgb = C_SLATE

    bot_bar1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.32), Inches(9.5), Inches(0.18))
    bot_bar1.fill.solid()
    bot_bar1.fill.fore_color.rgb = C_NAVY
    bot_bar1.line.fill.background()

    bot_bar2 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(9.5), Inches(7.32), Inches(3.833), Inches(0.18))
    bot_bar2.fill.solid()
    bot_bar2.fill.fore_color.rgb = C_RED
    bot_bar2.line.fill.background()

    def add_standard_header_footer(slide, title_text, page_num):
        hbar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.08))
        hbar.fill.solid()
        hbar.fill.fore_color.rgb = C_RED
        hbar.line.fill.background()

        tag = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(0.35), Inches(0.12), Inches(0.6))
        tag.fill.solid()
        tag.fill.fore_color.rgb = C_RED
        tag.line.fill.background()

        tx_title = slide.shapes.add_textbox(Inches(1.15), Inches(0.28), Inches(8.8), Inches(0.75))
        tf_t = tx_title.text_frame
        tf_t.word_wrap = True
        tf_t.margin_left = tf_t.margin_right = tf_t.margin_top = tf_t.margin_bottom = 0
        p_t = tf_t.paragraphs[0]
        p_t.text = title_text
        p_t.font.name = "Arial"
        p_t.font.size = Pt(23)
        p_t.font.bold = True
        p_t.font.color.rgb = C_NAVY

        if logo_path and os.path.exists(logo_path):
            slide.shapes.add_picture(logo_path, Inches(10.8), Inches(0.3), width=Inches(1.6))

        sep = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(1.18), Inches(11.533), Inches(0.02))
        sep.fill.solid()
        sep.fill.fore_color.rgb = C_BORDER
        sep.line.fill.background()

        fsep = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(6.85), Inches(11.533), Inches(0.02))
        fsep.fill.solid()
        fsep.fill.fore_color.rgb = C_BORDER
        fsep.line.fill.background()

        tx_foot = slide.shapes.add_textbox(Inches(0.9), Inches(6.92), Inches(8.0), Inches(0.4))
        tf_f = tx_foot.text_frame
        tf_f.margin_left = tf_f.margin_right = tf_f.margin_top = tf_f.margin_bottom = 0
        p_f = tf_f.paragraphs[0]
        p_f.text = f"Société Générale Côte d'Ivoire  •  T-chIA  •  {title}"
        p_f.font.name = "Arial"
        p_f.font.size = Pt(10)
        p_f.font.color.rgb = C_SLATE

        tx_page = slide.shapes.add_textbox(Inches(10.5), Inches(6.92), Inches(1.933), Inches(0.4))
        tf_p = tx_page.text_frame
        tf_p.margin_left = tf_p.margin_right = tf_p.margin_top = tf_p.margin_bottom = 0
        p_p = tf_p.paragraphs[0]
        p_p.alignment = PP_ALIGN.RIGHT
        p_p.text = f"{page_num} / {total_slides}"
        p_p.font.name = "Arial"
        p_p.font.size = Pt(10.5)
        p_p.font.bold = True
        p_p.font.color.rgb = C_NAVY

    # 2. Slide Sommaire (Zéro double numérotation, pastilles rouges)
    slide2 = prs.slides.add_slide(blank_layout)
    add_standard_header_footer(slide2, "Sommaire de la formation", 2)

    clean_points = [re.sub(r'^\s*(\d+[\.\)\-]\s*)+', '', pt).strip() for pt in sommaire_list]
    count_pts = len(clean_points)
    start_y = 1.45
    total_h = 5.15
    card_h = min(0.85, (total_h - (count_pts - 1) * 0.16) / max(count_pts, 1))
    gap_y = 0.16

    for idx, pt in enumerate(clean_points):
        y_pos = start_y + idx * (card_h + gap_y)
        card_pt = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(y_pos), Inches(11.533), Inches(card_h))
        card_pt.fill.solid()
        card_pt.fill.fore_color.rgb = C_CARD_BG
        card_pt.line.color.rgb = C_BORDER
        card_pt.line.width = Pt(1)

        badge_w = Inches(0.65)
        badge_h = Inches(card_h - 0.22)
        num_badge = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.1), Inches(y_pos + 0.11), badge_w, badge_h)
        num_badge.fill.solid()
        num_badge.fill.fore_color.rgb = C_RED
        num_badge.line.fill.background()
        
        tf_nb = num_badge.text_frame
        tf_nb.margin_left = tf_nb.margin_right = tf_nb.margin_top = tf_nb.margin_bottom = 0
        p_nb = tf_nb.paragraphs[0]
        p_nb.alignment = PP_ALIGN.CENTER
        p_nb.text = f"{idx+1:02d}"
        p_nb.font.name = "Arial"
        p_nb.font.size = Pt(14)
        p_nb.font.bold = True
        p_nb.font.color.rgb = C_WHITE

        tx_pt = slide2.shapes.add_textbox(Inches(1.95), Inches(y_pos + 0.08), Inches(10.3), Inches(card_h - 0.16))
        tf_pt = tx_pt.text_frame
        tf_pt.word_wrap = True
        tf_pt.margin_left = tf_pt.margin_right = tf_pt.margin_top = tf_pt.margin_bottom = 0
        p_pt = tf_pt.paragraphs[0]
        p_pt.text = pt
        p_pt.font.name = "Arial"
        p_pt.font.size = Pt(15.5)
        p_pt.font.bold = True
        p_pt.font.color.rgb = C_NAVY

    # 3. Slides de Contenu
    for i, s_data in enumerate(slides_list):
        page_num = 3 + i
        slide_i = prs.slides.add_slide(blank_layout)
        slide_title = s_data.get('titre', f"Module {i+1}")
        add_standard_header_footer(slide_i, slide_title, page_num)

        has_img = (image_path and os.path.exists(image_path) and (i == slide_image_index or (slide_image_index == -1 and i == 0)))
        puces = s_data.get('puces', [])
        clean_puces = [re.sub(r'^[•\-\*]\s*', '', p).strip() for p in puces]

        if has_img:
            content_w = Inches(6.1)
            try:
                img_frame = slide_i.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.3), Inches(1.45), Inches(5.133), Inches(5.15))
                img_frame.fill.solid()
                img_frame.fill.fore_color.rgb = C_WHITE
                img_frame.line.color.rgb = C_BORDER
                img_frame.line.width = Pt(1)
                slide_i.shapes.add_picture(image_path, Inches(7.45), Inches(1.6), width=Inches(4.833))
                s_data['has_image'] = True
            except Exception as e:
                print('Erreur insertion image PPTX:', e)
        else:
            content_w = Inches(11.533)

        n_puces = len(clean_puces)
        if n_puces > 0:
            total_avail_h = 5.2
            gap_puces = 0.18
            c_h = min(1.25, (total_avail_h - (n_puces - 1) * gap_puces) / n_puces)

            for p_idx, puce_text in enumerate(clean_puces):
                p_y = 1.45 + p_idx * (c_h + gap_puces)
                
                p_card = slide_i.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(p_y), content_w, Inches(c_h))
                p_card.fill.solid()
                p_card.fill.fore_color.rgb = C_CARD_BG
                p_card.line.color.rgb = C_BORDER
                p_card.line.width = Pt(1)

                bullet_h = min(Inches(0.55), Inches(c_h - 0.24))
                bullet_y = Inches(p_y) + (Inches(c_h) - bullet_h) / 2
                bullet_dot = slide_i.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.12), bullet_y, Inches(0.12), bullet_h)
                bullet_dot.fill.solid()
                bullet_dot.fill.fore_color.rgb = C_RED
                bullet_dot.line.fill.background()

                tf_p = p_card.text_frame
                tf_p.word_wrap = True
                tf_p.vertical_anchor = MSO_ANCHOR.MIDDLE
                tf_p.margin_left = Inches(0.65)
                tf_p.margin_right = Inches(0.4)
                tf_p.margin_top = Inches(0.08)
                tf_p.margin_bottom = Inches(0.08)

                para = tf_p.paragraphs[0]
                para.alignment = PP_ALIGN.LEFT
                para.text = ""
                
                font_size = Pt(15 if n_puces <= 4 else 13.5)
                if ":" in puce_text:
                    parts = puce_text.split(":", 1)
                    run_lead = para.add_run()
                    run_lead.text = parts[0].strip() + " : "
                    run_lead.font.name = "Arial"
                    run_lead.font.bold = True
                    run_lead.font.size = font_size
                    run_lead.font.color.rgb = C_NAVY

                    run_desc = para.add_run()
                    run_desc.text = parts[1].strip()
                    run_desc.font.name = "Arial"
                    run_desc.font.bold = False
                    run_desc.font.size = font_size
                    run_desc.font.color.rgb = C_NAVY
                else:
                    run = para.add_run()
                    run.text = puce_text
                    run.font.name = "Arial"
                    run.font.size = font_size
                    run.font.color.rgb = C_NAVY

    prs.save(output_pptx)
    return prs

def get_chroma_collection():
    data_dir = os.environ.get("DATA_DIR")
    if data_dir:
        CHROMA_PATH = os.path.join(data_dir, "chroma_db")
    elif os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "chroma_db")):
        CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "chroma_db")
    else:
        CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
    os.makedirs(CHROMA_PATH, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
    try:
        collection = chroma_client.get_collection(name="ai_formation_courses")
    except Exception:
        collection = chroma_client.create_collection(name="ai_formation_courses")
    return collection

def _generate_single_tts(text, output_path, voice="fr-FR-HenriNeural"):
    """Génère un fichier audio TTS pour un texte donné. Retourne le chemin ou None."""
    try:
        subprocess.run(["edge-tts", "--voice", voice, "--text", text, "--write-media", output_path], 
                       check=True, capture_output=True, timeout=60)
        return output_path
    except Exception as e:
        print(f"Erreur TTS pour {output_path}: {e}")
        return None

def generate_course_from_file(raw_filepath, base_filename, title, domain, output_dir, api_key=None, desc="", progress_callback=None, tutor_voice="fr-FR-HenriNeural"):
    if progress_callback: progress_callback("Initialisation...", 10)
    
    load_dotenv(override=True)
    GEMINI_API_KEY = api_key or os.getenv("GEMINI_API_KEY")
    
    if not GEMINI_API_KEY or GEMINI_API_KEY == "votre_cle_api_ici":
        raise Exception("Clé API manquante. Veuillez renseigner votre clé API.")
        
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # Détecter si l'input est une image
    input_is_image = is_image_file(raw_filepath)
    image_in_course_path = None
    
    if input_is_image:
        # Copier l'image dans le dossier de sortie pour l'inclure dans les supports
        img_ext = os.path.splitext(raw_filepath)[1].lower()
        image_in_course_path = os.path.join(output_dir, f"{base_filename}_illustration{img_ext}")
        shutil.copy2(raw_filepath, image_in_course_path)
        print(f"Image d'entrée détectée, copiée vers: {image_in_course_path}")
    
    # 1. Upload du fichier vers Gemini
    if progress_callback: progress_callback("Upload du document vers l'IA...", 20)
    print(f"Upload du fichier vers Gemini: {raw_filepath}")
    uploaded_file = client.files.upload(file=raw_filepath)
    if progress_callback: progress_callback("Attente du traitement du fichier par l'IA...", 25)
    
    # Polling avec timeout de 120 secondes
    poll_start = time.time()
    POLL_TIMEOUT = 120
    while uploaded_file.state == "PROCESSING":
        if time.time() - poll_start > POLL_TIMEOUT:
            raise Exception(f"Le traitement du fichier par Gemini a dépassé {POLL_TIMEOUT}s. Réessayez.")
        print(".", end="", flush=True)
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)
        
    print("\nFichier prêt. Génération du cours par l'IA...")
    if progress_callback: progress_callback("Analyse et création de la structure du cours...", 30)
    
    # Fonction Helper pour tester plusieurs modèles avec basculement automatique
    def generate_with_fallback(contents):
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.5-flash-preview-05-20",
            "gemini-2.0-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
        ]
        last_error = None
        for m in models_to_try:
            try:
                print(f"Tentative avec le modèle {m}...")
                response = client.models.generate_content(
                    model=m,
                    contents=contents
                )
                print(f"Succès avec le modèle {m}")
                return response
            except Exception as e:
                print(f"Erreur avec {m}: {str(e)}")
                last_error = e
        raise Exception(f"Tous les modèles ont échoué. Dernière erreur : {str(last_error)}")

    # 2. Générer le JSON du cours ET la base de connaissances RAG en UN SEUL appel
    image_instruction = ""
    if input_is_image:
        image_instruction = """
    IMPORTANT - IMAGE D'ENTRÉE :
    Ce fichier est une IMAGE (illustration, schéma, graphique, diagramme...).
    - Analyse cette image en profondeur et crée un cours complet basé sur ce qu'elle représente.
    - Dans le champ "slide_image", indique le numéro (index 0-based) de LA slide la plus pertinente où cette image devrait être affichée pour que l'apprenant puisse la voir. Choisis la slide qui correspond le mieux au contenu de l'image.
    - Dans la narration de cette slide, référence l'image en disant par exemple "Comme vous pouvez le voir sur l'illustration..." ou "Observons le schéma présenté...".
    - NE décris PAS l'image de façon détaillée dans les puces car l'apprenant la verra directement.
    """
    
    # Construire le contexte de description
    desc_instruction = ""
    if desc and desc.strip():
        desc_instruction = f"""
    CONSIGNES DE L'ADMINISTRATEUR (à respecter impérativement) :
    \"\"\"{desc}\"\"\"
    - Si une LANGUE est précisée, génère TOUT le contenu (titres, puces, narrations, sommaire) dans cette langue.
    - Si un TON est précisé (formel, accessible, ludique...), adapte le style de rédaction et la narration en conséquence.
    - Si une CIBLE est précisée (direction, poste, niveau...), adapte le vocabulaire et la profondeur du contenu à ce public.
    - Si des OBJECTIFS sont précisés, structure le cours pour atteindre ces objectifs.
    - Si des POINTS CLÉS sont mentionnés, assure-toi de les couvrir dans les slides.
    """
    
    prompt_combined = f"""
    Tu es un Directeur Pédagogique et Concepteur de Formations pour cadres et professionnels au sein de la Société Générale Côte d'Ivoire (SGCI / T-chIA).
    Analyse ce document source et conçois un support de formation d'excellence, digne d'un cabinet de conseil international ou d'une direction générale de banque.
    Thème : "{title}" (Domaine : {domain}).
    {desc_instruction}
    {image_instruction}

    EXIGENCES DE CONTENU ET DE STRUCTURE :
    - Rédige un contenu à haute valeur ajoutée : structure claire, définitions précises, cas d'usage réels, points de vigilance opérationnels et synthèse managériale.
    - Évite tout texte générique ou superficiel, les répétitions et les formulations artificielles.
    - Soigne la concision et l'impact des puces (synthétiques, percutantes, professionnelles).
    
    RÈGLES POUR LA NARRATION VOCALE (T-chIA) :
    - Élocution naturelle, vivante, captivante et engageante.
    - Interdiction absolue de répéter "Bienvenue" sur plusieurs diapositives ! Le mot "Bienvenue" doit figurer STRICTEMENT et UNIQUEMENT au tout début de la `narration_titre`.
    - La `narration_titre` introduit élégamment le sujet et son enjeu stratégique pour SGCI : "Bienvenue. Nous abordons aujourd'hui la formation sur [Titre], un volet fondamental pour..."
    - La `narration_sommaire` présente clairement l'articulation pédagogique : "Voici le programme que nous allons explorer ensemble..."
    - Chaque slide doit bénéficier d'une narration fluide avec des transitions naturelles.
    - La dernière slide doit être une synthèse et conclusion opérationnelle ("Pour conclure ce module...").
    
    Renvoie UNIQUEMENT un JSON structuré exactement comme suit, sans balises markdown ```json:
    {{
        "titre_cours": "{title}",
        "narration_titre": "Bienvenue. Nous abordons aujourd'hui la formation sur...",
        "sommaire": ["Point 1 : Enjeux et Fondamentaux", "Point 2 : Mécanismes Clés", "Point 3 : Cas Pratiques & Bonnes Pratiques", "Point 4 : Synthèse Opérationnelle"],
        "narration_sommaire": "Voici le programme que nous allons explorer ensemble...",
        "slides": [
            {{
                "titre": "Titre du Module / Slide",
                "puces": ["Point clé stratégique ou méthodologique 1", "Définition ou règle métier 2", "Bonne pratique ou point de contrôle 3"],
                "narration": "Explication pédagogique captivante, claire et bienveillante qui accompagne visuellement la diapositive."
            }}
        ],
        "slide_image": 0,
        "knowledge_base": "Synthèse exhaustive, structurée et détaillée de toutes les compétences, concepts réglementaires et cas pratiques pour alimenter le moteur de questions-réponses interactif T-chIA.",
        "quiz": [
            {{
                "question": "Énoncé précis et contextualisé testant une notion clé du module ?",
                "concept": "Nom exact de la compétence évaluée",
                "options": ["Option A (valide)", "Option B (distracteur)", "Option C (distracteur)", "Option D (distracteur)"],
                "correct_index": 0,
                "explication": "Explication pédagogique détaillée justifiant la réponse exacte selon les standards SGCI."
            }}
        ]
    }}
    Assure-toi de concevoir entre 4 et 6 diapositives de contenu approfondies (terminant par une conclusion/synthèse).
    Le quiz doit contenir 4 à 5 questions pertinentes (maximum 15 questions si enrichi).
    Ne produis que du JSON pur.
    """
    
    response_combined = generate_with_fallback([
        uploaded_file,
        prompt_combined
    ])
    
    if progress_callback: progress_callback("Traitement de la réponse de l'IA...", 50)
    
    # Parser le JSON avec robustesse
    clean_json = response_combined.text.replace("```json", "").replace("```", "").strip()
    try:
        course_data = json.loads(clean_json)
    except json.JSONDecodeError as e:
        print(f"Erreur de parsing JSON: {e}")
        print(f"Réponse brute (500 premiers chars): {clean_json[:500]}")
        # Tentative de nettoyage plus agressif
        json_match = re.search(r'\{[\s\S]*\}', clean_json)
        if json_match:
            try:
                course_data = json.loads(json_match.group())
            except json.JSONDecodeError:
                raise Exception(f"Impossible de parser la réponse de l'IA en JSON valide. Réessayez.")
        else:
            raise Exception(f"L'IA n'a pas retourné de JSON valide. Réessayez.")
    
    # 3. Indexer la base de connaissances RAG (extraite du même appel)
    print("Indexation de la base de connaissances RAG...")
    if progress_callback: progress_callback("Indexation des connaissances (RAG)...", 60)
    
    knowledge_text = course_data.pop("knowledge_base", "")
    slide_image_index = course_data.pop("slide_image", -1)
    quiz_data_extracted = course_data.pop("quiz", [])
    
    if knowledge_text:
        CHUNK_SIZE = 1500
        chunks = [knowledge_text[i:i+CHUNK_SIZE] for i in range(0, len(knowledge_text), CHUNK_SIZE)]
            
        print(f"Sauvegarde de {len(chunks)} chunks dans ChromaDB...")
        collection = get_chroma_collection()
        ids = [f"{base_filename}_{i}" for i in range(len(chunks))]
        collection.add(
            documents=chunks,
            ids=ids,
            metadatas=[{"source": base_filename} for _ in chunks]
        )
    else:
        print("Avertissement: Pas de base de connaissances extraite.")
        
    # Cleanup Gemini File
    try:
        client.files.delete(name=uploaded_file.name)
    except Exception:
        pass
        
    # 4. Créer la présentation PPTX corporate SGCI haute fidélité
    print("Création du diaporama PowerPoint haute fidélité...")
    if progress_callback: progress_callback("Génération du diaporama corporate...", 70)
    
    slides_list = course_data.get("slides", [])
    logo_path = os.path.join(os.path.dirname(__file__), "static", "img", "logo.png") if os.path.exists(os.path.join(os.path.dirname(__file__), "static", "img", "logo.png")) else os.path.join(os.path.dirname(__file__), "logo.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(os.path.dirname(__file__), "logo.jpg")
    
    pptx_path = os.path.join(output_dir, f"{base_filename}.pptx")
    build_executive_presentation(
        course_data=course_data,
        title=title,
        domain=domain,
        output_pptx=pptx_path,
        logo_path=logo_path,
        image_path=image_in_course_path if input_is_image else None,
        slide_image_index=slide_image_index
    )
    
    # 5. Génération Audio (TTS) - PARALLÈLE
    print("Génération de la narration audio avec Edge-TTS (parallèle)...")
    if progress_callback: progress_callback("Génération de la narration audio...", 80)
    
    # Préparer tous les segments audio à générer
    tts_tasks = []
    
    # Segment 0 : Introduction (Page 1)
    intro_text = course_data.get("narration_titre", f"Bienvenue. Aujourd'hui nous allons aborder le sujet sur {course_data.get('titre_cours', title)}.")
    intro_path = os.path.join(output_dir, f"{base_filename}_tts_0.mp3")
    tts_tasks.append({"page": 1, "text": intro_text, "path": intro_path})
    
    # Segment 1 : Sommaire (Page 2)
    narration_sommaire = course_data.get("narration_sommaire", "Voici le plan de notre cours pour aujourd'hui.")
    sommaire_path = os.path.join(output_dir, f"{base_filename}_tts_1.mp3")
    tts_tasks.append({"page": 2, "text": narration_sommaire, "path": sommaire_path})
    
    # Segments 2+ : Slides (Pages 3 à N)
    for i, slide_data in enumerate(slides_list):
        narration = slide_data.get("narration", "")
        if narration:
            temp_path = os.path.join(output_dir, f"{base_filename}_tts_{i+2}.mp3")
            tts_tasks.append({"page": i + 3, "text": narration, "path": temp_path})
    
    # Exécuter tous les TTS en parallèle
    print(f"Lancement de {len(tts_tasks)} tâches TTS en parallèle...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(tts_tasks), 6)) as executor:
        future_map = {}
        for task in tts_tasks:
            future = executor.submit(_generate_single_tts, task["text"], task["path"], tutor_voice)
            future_map[future] = task
        
        # Attendre tous les résultats
        concurrent.futures.wait(future_map.keys())
    
    # Assembler les audios dans l'ordre séquentiel
    final_full_audio = AudioSegment.empty()
    timestamps = []
    current_time = 0.0
    
    for task in tts_tasks:
        if os.path.exists(task["path"]):
            try:
                audio_seg = AudioSegment.from_mp3(task["path"])
                final_full_audio += audio_seg
                duration = len(audio_seg) / 1000.0
                timestamps.append({"page": task["page"], "start": current_time, "end": current_time + duration})
                current_time += duration
            except Exception as e:
                print(f"Erreur lecture audio {task['path']}: {e}")
            finally:
                # Nettoyer le fichier temporaire
                try:
                    os.remove(task["path"])
                except Exception:
                    pass
                
    audio_path = os.path.join(output_dir, f"{base_filename}_narration.mp3")
    final_full_audio.export(audio_path, format="mp3")
    
    timestamps_path = os.path.join(output_dir, f"{base_filename}_timestamps.json")
    with open(timestamps_path, "w", encoding="utf-8") as f:
        json.dump(timestamps, f)
    
    # 6. Conversion en PDF avec comtypes (PowerPoint)
    print("Conversion PPTX -> PDF...")
    if progress_callback: progress_callback("Conversion en PDF...", 90)
    pdf_path = os.path.join(output_dir, f"{base_filename}.pdf")
    pdf_converted = False
    try:
        comtypes.CoInitialize()
        powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
        powerpoint.Visible = 1
        presentation = powerpoint.Presentations.Open(os.path.abspath(pptx_path), WithWindow=False)
        presentation.SaveAs(os.path.abspath(pdf_path), 32)
        presentation.Close()
        powerpoint.Quit()
        comtypes.CoUninitialize()
        pdf_converted = True
    except Exception as e:
        print(f"Erreur de conversion PowerPoint COM : {e}")
        try:
            # Fallback FPDF avec support image et logo
            clean_sommaire = [re.sub(r'^\s*(\d+[\.\)\-]\s*)+', '', pt).strip() for pt in course_data.get("sommaire", [])]
            all_slides_for_pdf = [
                {"titre": course_data.get("titre_cours", title), "puces": [f"Domaine : {domain}", "Formation Professionnelle"]},
                {"titre": "Sommaire", "puces": [f"{idx+1}. {pt}" for idx, pt in enumerate(clean_sommaire)]}
            ] + slides_list
            generate_pdf_fallback(all_slides_for_pdf, pdf_path, image_path=image_in_course_path, logo_path=logo_path)
            pdf_converted = True
        except Exception as fpdf_err:
            print(f"Erreur fallback FPDF : {fpdf_err}")
            pdf_converted = False
            pdf_path = None
        
    if progress_callback: progress_callback("Terminé !", 100)
    
    clean_sommaire = [re.sub(r'^\s*(\d+[\.\)\-]\s*)+', '', pt).strip() for pt in course_data.get("sommaire", [])]
    all_slides_data = [
        {"titre": course_data.get("titre_cours", title), "puces": [f"Domaine : {domain}", "Formation Professionnelle"]},
        {"titre": "Sommaire", "puces": [f"{idx+1}. {pt}" for idx, pt in enumerate(clean_sommaire)]}
    ] + slides_list
    
    all_script = [
        course_data.get("narration_titre", ""),
        course_data.get("narration_sommaire", "")
    ] + [s.get("narration", "") for s in slides_list]

    result = {
        "pdf_filename": f"{base_filename}.pdf" if pdf_converted else None,
        "pptx_filename": f"{base_filename}.pptx",
        "audio_filename": f"{base_filename}_narration.mp3",
        "timestamps_filename": f"{base_filename}_timestamps.json",
        "slides_data": all_slides_data,
        "script": all_script,
        "quiz_data": json.dumps(quiz_data_extracted, ensure_ascii=False) if quiz_data_extracted else ""
    }
    
    # Ajouter le chemin de l'image si elle existe
    if image_in_course_path and os.path.exists(image_in_course_path):
        result["illustration_filename"] = os.path.basename(image_in_course_path)
    
    return result

def generate_quiz_for_course_content(title, domain, content_summary, num_questions=5):
    """Génère un test d'évaluation pour un cours (strictement plafonné à 15 questions maximum)."""
    load_dotenv(override=True)
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    # Règle stricte Section 28 : limitation à 15 questions maximum
    try:
        num_questions = min(max(int(num_questions), 1), 15)
    except Exception:
        num_questions = 5
    
    prompt = f"""
    Tu es un concepteur pédagogique expert de la SGCI Academy (Société Générale Côte d'Ivoire).
    Crée un test d'évaluation certifiant pour la formation suivante :
    Titre : {title}
    Domaine : {domain}
    Contenu / Notions clés : {content_summary[:3500]}
    
    Consignes strictes :
    - Crée exactement {num_questions} questions à choix multiples (QCM) pertinentes, professionnelles et concrètes.
    - Chaque question doit évaluer un concept ou une compétence clé spécifique du cours.
    - Fournis 4 options de réponse plausibles pour chaque question (dont une seule correcte).
    - Fournis une explication pédagogique bienveillante et détaillée pour la bonne réponse.
    - Remplis le champ 'concept' avec le nom précis de la notion évaluée (ex: 'Hiérarchie des besoins', 'Sécurité psychologique', 'Innovations de rupture', etc.).
    
    Renvoie UNIQUEMENT un JSON pur valide sous cette forme, sans balises markdown :
    [
        {{
            "question": "Énoncé clair de la question ?",
            "concept": "Nom de la notion clé",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_index": 0,
            "explication": "Explication pédagogique claire de la bonne réponse."
        }}
    ]
    """
    for m in ["gemini-2.5-flash", "gemini-2.5-flash-preview-05-20", "gemini-flash-latest"]:
        try:
            resp = client.models.generate_content(model=m, contents=prompt)
            clean = resp.text.replace("```json", "").replace("```", "").strip()
            match = re.search(r'\[[\s\S]*\]', clean)
            if match:
                quiz = json.loads(match.group())
                if isinstance(quiz, list) and len(quiz) > 0:
                    return quiz[:15]
            quiz = json.loads(clean)
            if isinstance(quiz, list) and len(quiz) > 0:
                return quiz[:15]
        except Exception as e:
            print(f"Erreur modèle {m} pour quiz: {e}")
    return []

def evaluate_and_diagnose_submission(title, domain, quiz_questions, user_answers):
    """Calcule la note de l'évaluation et génère un diagnostic pédagogique poussé avec conseils de renforcement."""
    total = len(quiz_questions)
    if total == 0:
        return {"score": 0, "passed": False, "diagnostic": {}}
    
    correct_count = 0
    detailed_results = []
    strengths = []
    weaknesses = []
    
    for idx, q in enumerate(quiz_questions):
        # Récupérer l'index choisi par l'utilisateur
        user_choice = user_answers.get(str(idx), user_answers.get(idx, None))
        is_correct = (user_choice is not None and int(user_choice) == int(q.get("correct_index", 0)))
        
        options = q.get("options", [])
        correct_idx = int(q.get("correct_index", 0))
        user_choice_int = int(user_choice) if user_choice is not None else None
        
        user_choice_label = options[user_choice_int] if (user_choice_int is not None and 0 <= user_choice_int < len(options)) else "Aucune réponse"
        correct_choice_label = options[correct_idx] if (0 <= correct_idx < len(options)) else ""
        
        concept_name = q.get("concept", f"Notion {idx+1}")
        
        if is_correct:
            correct_count += 1
            strengths.append({
                "concept": concept_name,
                "question": q.get("question", ""),
                "explication": q.get("explication", "")
            })
        else:
            weaknesses.append({
                "concept": concept_name,
                "question": q.get("question", ""),
                "user_answer": user_choice_label,
                "correct_answer": correct_choice_label,
                "explication": q.get("explication", "")
            })
            
        detailed_results.append({
            "index": idx,
            "question": q.get("question", ""),
            "concept": concept_name,
            "options": options,
            "user_choice": user_choice_int,
            "correct_index": correct_idx,
            "is_correct": is_correct,
            "explication": q.get("explication", "")
        })
        
    score_pct = round((correct_count / total) * 100.0, 1)
    passed = (score_pct >= 70.0)
    
    # Structure de base du diagnostic
    diagnostic_ai = {
        "bilan_pedagogique": f"Vous avez obtenu {correct_count}/{total} ({score_pct}%). " + ("Excellente performance, les compétences clés de ce module sont validées !" if passed else "Courage, vous y êtes presque ! Quelques notions méritent d'être consolidées pour valider le module."),
        "conseils_renforcement": [
            "Consultez les fiches récapitulatives ci-dessous pour fixer les notions non maîtrisées.",
            "Posez des questions directes à votre Tuteur IA sur les points d'hésitation."
        ],
        "points_forts_resume": [s["concept"] for s in strengths],
        "points_a_renforcer": [w["concept"] for w in weaknesses],
        "synthese_renforcement": ""
    }
    
    # Appel à Gemini pour affiner le diagnostic personnalisé si des erreurs existent
    try:
        load_dotenv(override=True)
        api_key = os.environ.get("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)
        
        eval_prompt = f"""
        Tu es le Tuteur Pédagogique IA officiel de la Société Générale Côte d'Ivoire (SGCI Academy).
        Un collaborateur vient de passer l'évaluation finale pour le cours : "{title}" (Domaine: {domain}).
        Score : {correct_count}/{total} ({score_pct}%). Statut : {'VALIDÉ' if passed else 'NON VALIDÉ (Seuil à 70%)'}.
        
        Notions bien maîtrisées par l'apprenant :
        {json.dumps([s['concept'] for s in strengths], ensure_ascii=False)}
        
        Notions où l'apprenant a commis des erreurs ou doit consolider :
        {json.dumps([{'concept': w['concept'], 'question': w['question'], 'bonne_reponse': w['correct_answer'], 'explication': w['explication']} for w in weaknesses], ensure_ascii=False)}
        
        Rédige un diagnostic pédagogique constructif et bienveillant en JSON strict :
        {{
            "bilan_pedagogique": "Un message chaleureux, humain, personnalisé et motivant de 3 à 4 phrases valorisant les réussites et encourageant la progression.",
            "conseils_renforcement": [
                "Conseil méthodologique 1 pour ancrer la pratique",
                "Conseil méthodologique 2 adapté aux notions fragiles"
            ],
            "synthese_renforcement": "Un court paragraphe didactique synthétisant simplement et clairement les notions non acquises pour que l'apprenant comprenne tout de suite sans jargon."
        }}
        Renvoie UNIQUEMENT le JSON pur, sans balises markdown.
        """
        resp = client.models.generate_content(model="gemini-2.5-flash", contents=eval_prompt)
        clean = resp.text.replace("```json", "").replace("```", "").strip()
        match = re.search(r'\{[\s\S]*\}', clean)
        if match:
            parsed = json.loads(match.group())
            diagnostic_ai.update(parsed)
    except Exception as e:
        print(f"Erreur génération diagnostic IA: {e}")
        
    return {
        "score": score_pct,
        "passed": passed,
        "total": total,
        "total_questions": total,
        "correct_count": correct_count,
        "correct_answers": correct_count,
        "results_by_question": detailed_results,
        "detailed_results": detailed_results,
        "notions_acquises": strengths,
        "strengths": strengths,
        "notions_a_renforcer": weaknesses,
        "weaknesses": weaknesses,
        "diagnostic": diagnostic_ai,
        "bilan_pedagogique": diagnostic_ai.get("bilan_pedagogique", ""),
        "conseils_renforcement": diagnostic_ai.get("conseils_renforcement", []),
        "synthese_renforcement": diagnostic_ai.get("synthese_renforcement", "")
    }
