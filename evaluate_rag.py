"""
Script d'evaluation du pipeline RAG (ChromaDB + Google Gemini).
Mesure les trois metriques standard (RAG Triad) :
1. Pertinence du contexte (Context Relevance)
2. Fidelite / Non-hallucination (Groundedness / Faithfulness)
3. Pertinence de la reponse (Answer Relevance)
Mesure egalement les latences de recherche vectorielle et de generation.
"""

import os
import sys
import time
import json
import sqlite3
import argparse
from typing import List, Dict, Any

sys.stdout.reconfigure(encoding='utf-8')

# Chargement configuration
from dotenv import load_dotenv
load_dotenv()

import chromadb
from google import genai

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("[ERREUR] GEMINI_API_KEY non definie dans le fichier .env")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)

# Initialisation ChromaDB
CHROMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "chroma_db") if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "chroma_db")) else os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
collection = chroma_client.get_or_create_collection(name="ai_formation_courses")

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "database.db") if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "database.db")) else os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

# Questions de test de reference par cours
BENCHMARK_SUITES = {
    # Pyramide de Maslow
    "3e5fc339-5451-4640-bb5a-388bac252522": [
        "Quels sont les cinq niveaux de besoins selon la pyramide de Maslow ?",
        "Qu'est-ce qu'un besoin physiologique ?",
        "Comment satisfaire le besoin d'estime dans le cadre professionnel ?",
        "Quel niveau de besoin concerne la recherche de securite de l'emploi ?",
        "Quel est le besoin situe tout au sommet de la pyramide ?"
    ],
    # Styles de Management
    "18283e6b-47f9-4646-b07c-aa3c17dcaa58": [
        "Quels sont les principaux styles de management presentes dans ce cours ?",
        "En quoi consiste le management directif ?",
        "Quand doit-on utiliser le style participatif ?",
        "Quelle est la difference entre management delegatif et persuasif ?"
    ]
}

def get_courses_from_db():
    courses = []
    if os.path.exists(DB_FILE):
        try:
            conn = sqlite3.connect(DB_FILE)
            cur = conn.cursor()
            cur.execute("SELECT id, title, base_filename FROM courses ORDER BY id ASC")
            for row in cur.fetchall():
                c_id, title, base_fn = row
                courses.append({
                    "id": c_id,
                    "title": title,
                    "base_id": base_fn or ""
                })
            conn.close()
        except Exception as e:
            print(f"[AVERTISSEMENT] Impossible de lire la base SQLite : {e}")
    return courses

def query_rag(message: str, base_id: str, n_results: int = 3):
    start_t = time.perf_counter()
    results = None
    try:
        results = collection.query(
            query_texts=[message],
            n_results=n_results,
            where={"source": base_id} if base_id else None
        )
    except Exception as e:
        try:
            results = collection.query(query_texts=[message], n_results=n_results)
        except Exception:
            pass

    retrieval_ms = (time.perf_counter() - start_t) * 1000

    docs = []
    if results and results.get("documents") and results["documents"][0]:
        docs = results["documents"][0]

    context = "\n\n".join(docs)
    return context, docs, retrieval_ms

def generate_answer(message: str, context: str):
    start_t = time.perf_counter()
    
    if context:
        prompt = f"""Tu es un expert formateur professionnel. Reponds directement, precisement et de maniere professionnelle a la question posee, en utilisant le contexte du cours ci-dessous.

REGLES STRICTES :
- Sois direct, concis et clair (1 ou 2 phrases maximum).
- AUCUN prefixe, AUCUNE formule superflue (ne dis pas 'En tant qu'IA...', 'IA Tutor', 'D'apres les documents...').
- Donne UNIQUEMENT la reponse metier pertinente.

CONTEXTE DU COURS :
{context}

QUESTION DE L'APPRENANT :
{message}"""
    else:
        prompt = f"""Tu es un formateur professionnel. Reponds de maniere concise, precise et professionnelle (1 ou 2 phrases max) a la question suivante dans le cadre du metier : {message}. Si c'est une question tres specifique sur un element absent du support, indique simplement et directement que l'information n'est pas precisee dans ce support."""

    models_to_try = [
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3.6-flash",
        "gemini-3.7-flash",
        "gemini-3.5-flash",
        "gemini-flash-latest"
    ]
    
    answer = None
    used_model = None
    for m in models_to_try:
        try:
            resp = client.models.generate_content(model=m, contents=prompt)
            if resp.candidates and resp.candidates[0].content:
                answer = (resp.text or "").strip()
            else:
                answer = "Cette information n'est pas precisee dans ce cours."
            used_model = m
            break
        except Exception:
            continue

    if answer is None:
        answer = "[ERREUR] Aucune reponse n'a pu etre generee par les modeles Gemini."

    generation_ms = (time.perf_counter() - start_t) * 1000
    return answer, used_model, generation_ms

def judge_evaluation(question: str, context: str, answer: str) -> Dict[str, Any]:
    judge_prompt = f"""Tu es un auditeur qualite et expert en evaluation de systemes RAG (Retrieval-Augmented Generation).
Evalue l'echange suivant selon les 3 metriques standard du RAG Triad :

1. Pertinence du Contexte (context_relevance, note de 0 a 100) :
Le contexte recupere contient-il les faits necessaires pour repondre a la question sans trop de bruit inutile ?
(100 = contexte parfaitement adapte et riche en faits pertinents ; 0 = contexte totalement hors-sujet ou vide)

2. Fidelite / Non-hallucination (groundedness, note de 0 a 100) :
La reponse formulee est-elle strictement fondee et justifiable par le contexte extrait ?
(100 = chaque affirmation est prouvee par le contexte, aucune invention ; 0 = pure hallucination ou contradiction)

3. Pertinence de la Reponse (answer_relevance, note de 0 a 100) :
La reponse s'adresse-t-elle directement et clairement a la question posee ?
(100 = reponse claire, directe et precise a la question ; 0 = ne repond pas du tout a la question)

---
QUESTION :
{question}

CONTEXTE RECUPERE :
{context if context else '[AUCUN CONTEXTE RETROUVE]'}

REPONSE GENEREE :
{answer}
---

Reponds EXCLUSIVEMENT au format JSON strict valide, sans code block markdown :
{{
  "context_relevance": <entier entre 0 et 100>,
  "groundedness": <entier entre 0 et 100>,
  "answer_relevance": <entier entre 0 et 100>,
  "comment": "<explication concise en 1 phrase>"
}}"""

    models_to_try = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]
    for m in models_to_try:
        try:
            resp = client.models.generate_content(model=m, contents=judge_prompt)
            raw = (resp.text or "").strip()
            if raw.startswith("```json"):
                raw = raw[7:]
            if raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
            parsed = json.loads(raw)
            return {
                "context_relevance": int(parsed.get("context_relevance", 0)),
                "groundedness": int(parsed.get("groundedness", 0)),
                "answer_relevance": int(parsed.get("answer_relevance", 0)),
                "comment": str(parsed.get("comment", ""))
            }
        except Exception:
            continue

    return {
        "context_relevance": 50,
        "groundedness": 50,
        "answer_relevance": 50,
        "comment": "Evaluation de repli."
    }

def run_evaluation(course_base_id: str = None, questions: List[str] = None):
    print("=" * 75)
    print("           EVALUATION DU PIPELINE RAG (ChromaDB + Gemini)")
    print("=" * 75)

    courses = get_courses_from_db()
    target_course = None
    if course_base_id:
        for c in courses:
            if c["base_id"] == course_base_id:
                target_course = c
                break
        if not target_course:
            target_course = {
                "id": 0,
                "title": f"Cours ({course_base_id[:8]}...)",
                "base_id": course_base_id
            }
    
    if not target_course and courses:
        for c in courses:
            if c["base_id"] in BENCHMARK_SUITES:
                target_course = c
                break
        if not target_course:
            target_course = courses[-1]

    if not target_course:
        print("[ERREUR] Aucun cours repertorie dans la base de donnees.")
        return

    base_id = target_course["base_id"]
    course_title = target_course["title"]
    print(f"Cours cible   : [{target_course['id']}] {course_title}")
    print(f"Identifiant   : {base_id}")

    try:
        ch_data = collection.get(where={"source": base_id})
        count_chunks = len(ch_data["ids"]) if ch_data and "ids" in ch_data else 0
        print(f"Chunks Chroma : {count_chunks} fragment(s) indexe(s)")
    except Exception as e:
        count_chunks = 0
        print(f"Chunks Chroma : Erreur de lecture ({e})")

    if not questions:
        if base_id in BENCHMARK_SUITES:
            questions = BENCHMARK_SUITES[base_id]
        else:
            questions = [
                f"De quoi traite ce cours sur {course_title} ?",
                f"Quels sont les points cles a retenir ?",
                f"Quelles sont les bonnes pratiques recommandees ?"
            ]

    print(f"Nombre de tests a executer : {len(questions)}")
    print("-" * 75)

    eval_results = []

    for idx, q in enumerate(questions, start=1):
        print(f"\n[Test {idx}/{len(questions)}] Question : \"{q}\"")
        
        context, docs, ret_ms = query_rag(q, base_id, n_results=3)
        print(f"  - Recherche ChromaDB : {len(docs)} chunk(s) extrait(s) en {ret_ms:.1f} ms")

        answer, model_used, gen_ms = generate_answer(q, context)
        print(f"  - Generation ({model_used}) : {gen_ms:.1f} ms")
        print(f"  - Reponse : {answer}")

        judge_res = judge_evaluation(q, context, answer)
        c_rel = judge_res["context_relevance"]
        grounded = judge_res["groundedness"]
        a_rel = judge_res["answer_relevance"]
        total_ms = ret_ms + gen_ms

        print(f"  - Scores : Pertinence Contexte = {c_rel}/100 | Fidelite = {grounded}/100 | Pertinence Reponse = {a_rel}/100")
        print(f"  - Juge : {judge_res['comment']}")

        eval_results.append({
            "test_id": idx,
            "question": q,
            "chunks_count": len(docs),
            "chunks": docs,
            "retrieval_ms": round(ret_ms, 1),
            "generation_ms": round(gen_ms, 1),
            "total_latency_ms": round(total_ms, 1),
            "answer": answer,
            "context_relevance": c_rel,
            "groundedness": grounded,
            "answer_relevance": a_rel,
            "rag_score": round((c_rel + grounded + a_rel) / 3.0, 1),
            "judge_comment": judge_res["comment"]
        })

    avg_c_rel = sum(r["context_relevance"] for r in eval_results) / len(eval_results)
    avg_grounded = sum(r["groundedness"] for r in eval_results) / len(eval_results)
    avg_a_rel = sum(r["answer_relevance"] for r in eval_results) / len(eval_results)
    avg_rag = sum(r["rag_score"] for r in eval_results) / len(eval_results)
    avg_latency = sum(r["total_latency_ms"] for r in eval_results) / len(eval_results)
    avg_retrieval = sum(r["retrieval_ms"] for r in eval_results) / len(eval_results)

    print("\n" + "=" * 75)
    print("                       TABLEAU RECAPITULATIF")
    print("=" * 75)
    header = f"{'Test':<6} | {'Contexte':<9} | {'Fidelite':<9} | {'Reponse':<9} | {'Score RAG':<10} | {'Latence'}"
    print(header)
    print("-" * 75)
    for r in eval_results:
        row = f"#{r['test_id']:<5} | {r['context_relevance']:>3}/100    | {r['groundedness']:>3}/100    | {r['answer_relevance']:>3}/100   | {r['rag_score']:>5.1f}%    | {r['total_latency_ms']:>6.1f} ms"
        print(row)
    print("-" * 75)
    summary_row = f"MOYEN. | {avg_c_rel:>3.1f}/100  | {avg_grounded:>3.1f}/100  | {avg_a_rel:>3.1f}/100 | {avg_rag:>5.1f}%    | {avg_latency:>6.1f} ms"
    print(summary_row)
    print("=" * 75)

    print("\nANALYSE DIAGNOSTIQUE & RECOMMANDATIONS :")
    if avg_c_rel >= 80:
        print("- Recherche Vectorielle (ChromaDB) : Excellente pertinence des chunks extraits.")
    else:
        print("- Recherche Vectorielle (ChromaDB) : Certains chunks contiennent du bruit. Suggestion : ajuster la taille du chunking ou augmenter top_k a 4.")

    if avg_grounded >= 85:
        print("- Fidelite (Groundedness) : Tres haute fiabilite, aucune hallucination detectee.")
    else:
        print("- Fidelite (Groundedness) : Risque d'extrapolation detecte. Suggestion : renforcer la consigne d'ancrage strict.")

    if avg_a_rel >= 85:
        print("- Pertinence Reponse : Reponses directes, concises et conformes aux regles SGCI.")
    else:
        print("- Pertinence Reponse : Les reponses pourraient etre plus directes.")

    if avg_latency < 2500:
        print(f"- Performance globale : Rapide (Moyenne totale: {avg_latency:.0f} ms dont ChromaDB: {avg_retrieval:.0f} ms).")
    else:
        print(f"- Performance globale : Temps de reponse convenable ({avg_latency:.0f} ms).")

    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "course_id": target_course["id"],
        "course_title": target_course["title"],
        "base_id": base_id,
        "total_tests": len(eval_results),
        "averages": {
            "context_relevance": round(avg_c_rel, 1),
            "groundedness": round(avg_grounded, 1),
            "answer_relevance": round(avg_a_rel, 1),
            "global_rag_score": round(avg_rag, 1),
            "retrieval_latency_ms": round(avg_retrieval, 1),
            "total_latency_ms": round(avg_latency, 1)
        },
        "tests": eval_results
    }

    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rag_evaluation_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nRapport complet exporte dans : {report_path}")
    return report

def get_latest_report():
    """Charge le dernier rapport d'evaluation JSON s'il existe."""
    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rag_evaluation_report.json")
    if os.path.exists(report_path):
        try:
            with open(report_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AVERTISSEMENT] Erreur lecture rapport JSON: {e}")
    return None

def get_evaluable_courses():
    """Retourne la liste des cours avec leur nombre de chunks indexes dans ChromaDB."""
    courses = get_courses_from_db()
    enriched = []
    seen_bids = set()
    for c in courses:
        bid = c.get("base_id") or ""
        seen_bids.add(bid)
        count_chunks = 0
        if bid:
            try:
                ch = collection.get(where={"source": bid})
                if ch and "ids" in ch:
                    count_chunks = len(ch["ids"])
            except Exception:
                pass
        has_bench = bid in BENCHMARK_SUITES
        bench_count = len(BENCHMARK_SUITES[bid]) if has_bench else 3
        enriched.append({
            "id": c["id"],
            "title": c["title"],
            "base_id": bid,
            "chunks_count": count_chunks,
            "has_benchmark": has_bench,
            "benchmark_questions_count": bench_count
        })

    # Ajouter les suites de référence indexées dans ChromaDB
    suite_names = {
        "3e5fc339-5451-4640-bb5a-388bac252522": "COMPRENDRE LA PYRAMIDE DE MASLOW",
        "18283e6b-47f9-4646-b07c-aa3c17dcaa58": "STYLES DE MANAGEMENT ET LEADERSHIP"
    }
    for bench_bid, qlist in BENCHMARK_SUITES.items():
        if bench_bid not in seen_bids:
            count_chunks = 0
            try:
                ch = collection.get(where={"source": bench_bid})
                if ch and "ids" in ch:
                    count_chunks = len(ch["ids"])
            except Exception:
                pass
            if count_chunks > 0:
                enriched.append({
                    "id": 0,
                    "title": suite_names.get(bench_bid, f"Cours Benchmark ({bench_bid[:8]})"),
                    "base_id": bench_bid,
                    "chunks_count": count_chunks,
                    "has_benchmark": True,
                    "benchmark_questions_count": len(qlist)
                })
                seen_bids.add(bench_bid)

    return enriched

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluer le RAG ChromaDB + Gemini")
    parser.add_argument("--course_id", type=str, help="Base ID du fichier PDF du cours a tester", default=None)
    parser.add_argument("--query", type=str, help="Question unique a tester en mode direct", default=None)
    args = parser.parse_args()

    if args.query:
        run_evaluation(course_base_id=args.course_id, questions=[args.query])
    else:
        run_evaluation(course_base_id=args.course_id)

