import os

def build_index():
    basedir = os.path.dirname(os.path.abspath(__file__))
    
    head_content = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plateforme de Formation IA - SGCI</title>
    <link rel="stylesheet" href="static/css/style.css">
    <!-- Chart.js pour le tableau de bord analytics -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>
    <!-- Script PDF.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    </script>
</head>
<body>
    <script>
        // Si non authentifié et sans session active, redirection vers /login
        try {
            if (!sessionStorage.getItem('ia_formation_user') && !localStorage.getItem('ia_formation_user')) {
                if (document.cookie.indexOf('ia_user_role') === -1) {
                    window.location.href = '/login';
                }
            }
        } catch(e) {}
    </script>
"""

    def read_part(rel_path):
        with open(os.path.join(basedir, rel_path), 'r', encoding='utf-8') as f:
            return f.read()

    header_nav = read_part('templates/components/header-nav.html')

    admin_dashboard = read_part('templates/pages/admin_dashboard.html')
    user_dashboard = read_part('templates/pages/user_dashboard.html')

    consultation = read_part('templates/pages/consultation.html')
    details = read_part('templates/pages/details.html')
    presentation = read_part('templates/pages/presentation.html')
    evaluation = read_part('templates/pages/evaluation.html')

    users_page = read_part('templates/pages/users.html')
    assignments_page = read_part('templates/pages/assignments.html')
    creation_page = read_part('templates/pages/creation.html')
    rag_eval_page = read_part('templates/pages/rag-eval.html')

    disclosure_modal = read_part('templates/components/disclosure-modal.html')
    modals = read_part('templates/components/modals.html')
    assistant_widget = read_part('templates/components/assistant-widget.html')

    dashboard_block = f"""
    <!-- Page Dashboard : Entièrement Modulaire selon le Profil Utilisateur -->
    <div id="page-dashboard" class="page">
        {{% if user_role == 'user' %}}
        <!-- Vue Apprenant Exclusive -->
{user_dashboard}
        {{% elif user_role in ['admin', 'superadmin'] %}}
        <!-- Vue Administrateur & Pilotage Exclusive -->
{admin_dashboard}
        {{% else %}}
        <!-- Vue par défaut (Support universel) -->
{admin_dashboard}
{user_dashboard}
        {{% endif %}}
    </div>
"""

    common_pages_block = f"""
    <!-- Pages Communes / Partagées (Apprenants & Administrateurs) -->
{consultation}
{details}
{presentation}
{evaluation}
"""

    admin_pages_block = f"""
    <!-- Pages Réservées aux Administrateurs (users, assignments, creation, rag-eval) -->
    {{% if user_role != 'user' %}}
{users_page}
{assignments_page}
{creation_page}
    {{% if user_role == 'superadmin' or not user_role %}}
{rag_eval_page}
    {{% endif %}}
    {{% endif %}}
"""

    scripts_content = """
    <!-- Configuration -->
    <script src="static/js/config.js"></script>

    <!-- JS Core : État global, Thèmes, Navigation & Authentification -->
    <script src="static/js/core/state.js"></script>
    <script src="static/js/core/theme.js"></script>
    <script src="static/js/core/router.js"></script>
    <script src="static/js/core/auth.js"></script>

    <!-- JS Composants : Navigation & Modales -->
    <script src="static/js/components/navbar.js"></script>
    <script src="static/js/components/modals.js"></script>
    <script src="static/js/components/assistant-chat.js"></script>

    <!-- JS Modules de Pages : Totalement Isolés par Domaine Fonctionnel -->
    <script src="static/js/pages/users.js"></script>
    <script src="static/js/pages/assignments.js"></script>
    <script src="static/js/pages/catalog.js"></script>
    <script src="static/js/pages/creation.js"></script>
    <script src="static/js/pages/presentation.js"></script>
    <script src="static/js/pages/live-tutor.js"></script>
    <script src="static/js/pages/evaluation.js"></script>
    <script src="static/js/pages/dashboard.js"></script>
    <script src="static/js/pages/rag-eval.js"></script>

    <!-- Initialisation & Démarrage de l'Application -->
    <script src="static/js/main.js"></script>
</body>
</html>
"""

    full_html = (
        head_content +
        header_nav +
        dashboard_block +
        common_pages_block +
        admin_pages_block +
        disclosure_modal +
        modals +
        assistant_widget +
        scripts_content
    )

    template_index = os.path.join(basedir, 'templates', 'index.html')
    with open(template_index, 'w', encoding='utf-8') as f:
        f.write(full_html)
    print(f"templates/index.html generated successfully! ({len(full_html)} chars)")

    # Supprimer l'éventuel index.html à la racine s'il existe
    root_index = os.path.join(basedir, 'index.html')
    if os.path.exists(root_index):
        os.remove(root_index)

if __name__ == '__main__':
    build_index()
