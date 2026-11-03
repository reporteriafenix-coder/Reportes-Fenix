
// ========================================
// CONEXIÓN CON SUPABASE - REPORTES FÉNIX
// ========================================

(function () {
    const SUPABASE_URL = "https://kyihelsmizhsozbpidbw.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ESQtXs7ivHl7FlSleWrS6g_iG4dS1dg";

    if (!window.supabase || !window.supabase.createClient) {
        console.error("No se pudo cargar Supabase JS");
        return;
    }

    window.fenixSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        }
    );

    console.log("Supabase conectado correctamente");
})();
