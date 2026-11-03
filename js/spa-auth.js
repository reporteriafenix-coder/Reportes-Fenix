// ========================================
// AUTENTICACIÓN ÚNICA DE LA SPA - FÉNIX
// ========================================
(function () {
    document.documentElement.classList.add("fenix-auth-pending");

    async function iniciarAutenticacion() {
        const supabase = window.fenixSupabase;

        if (!supabase) {
            throw new Error("No está disponible la conexión con Supabase.");
        }

        const { data, error } = await supabase.auth.getClaims();

        if (error || !data?.claims?.sub) {
            window.location.replace("acceso-sistema.html");
            throw new Error("La sesión no es válida.");
        }

        const claims = data.claims;
        const role = claims.user_role;

        if (!role) {
            await supabase.auth.signOut({ scope: "local" });
            window.location.replace("acceso-sistema.html");
            throw new Error("La cuenta no tiene un rol asignado.");
        }

        const usuario = {
            id: claims.sub,
            email: claims.email || "",
            role: role,
            name: claims.user_metadata?.full_name || claims.email || "Usuario"
        };

        window.FENIX_USER = usuario;
        document.documentElement.classList.remove("fenix-auth-pending");
        window.dispatchEvent(new CustomEvent("fenix:auth-ready", { detail: usuario }));

        return usuario;
    }

    window.FENIX_AUTH_READY = iniciarAutenticacion();

    window.FENIX_AUTH_READY.catch(function (error) {
        console.error("No se pudo iniciar Reportes Fénix:", error);
        // Si la navegación ya fue redirigida al login, no se muestra otro aviso.
        document.documentElement.classList.remove("fenix-auth-pending");
    });
})();
