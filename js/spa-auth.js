
// ========================================
// AUTENTICACIÓN Y EXPIRACIÓN DE SESIÓN - FÉNIX
// Duración máxima: 90 minutos.
// ========================================

(function () {
    const SESSION_START_KEY = "fenix_session_started_at";
    const SESSION_DURATION_MS = 90 * 60 * 1000;

    let expirationTimer = null;
    let isRedirecting = false;

    document.documentElement.classList.add("fenix-auth-pending");

    function obtenerInicioSesion() {
        const guardado = Number(localStorage.getItem(SESSION_START_KEY));

        if (Number.isFinite(guardado) && guardado > 0) {
            return guardado;
        }

        // Para sesiones anteriores a esta actualización.
        const ahora = Date.now();
        localStorage.setItem(SESSION_START_KEY, String(ahora));

        return ahora;
    }

    async function cerrarSesionExpirada(supabase) {
        if (isRedirecting) return;

        isRedirecting = true;

        if (expirationTimer) {
            clearTimeout(expirationTimer);
            expirationTimer = null;
        }

        try {
            await supabase.auth.signOut({ scope: "local" });
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }

        localStorage.removeItem(SESSION_START_KEY);

        window.location.replace("acceso-sistema.html?expirada=1");
    }

    function comprobarExpiracion(supabase) {
        if (isRedirecting) return;

        const inicio = obtenerInicioSesion();

        const restante =
            SESSION_DURATION_MS - (Date.now() - inicio);

        if (restante <= 0) {
            void cerrarSesionExpirada(supabase);
            return;
        }

        if (expirationTimer) {
            clearTimeout(expirationTimer);
        }

        expirationTimer = setTimeout(function () {
            void cerrarSesionExpirada(supabase);
        }, restante);
    }

    async function iniciarAutenticacion() {
        const supabase = window.fenixSupabase;

        if (!supabase) {
            throw new Error("No está disponible la conexión con Supabase.");
        }

        const inicio = obtenerInicioSesion();

        if (Date.now() - inicio >= SESSION_DURATION_MS) {
            await cerrarSesionExpirada(supabase);
            throw new Error("La sesión expiró.");
        }

        const { data, error } = await supabase.auth.getClaims();

        if (error || !data?.claims?.sub) {
            localStorage.removeItem(SESSION_START_KEY);
            window.location.replace("acceso-sistema.html");
            throw new Error("La sesión no es válida.");
        }

        const claims = data.claims;
        const role = claims.user_role;

        if (!role) {
            await supabase.auth.signOut({ scope: "local" });
            localStorage.removeItem(SESSION_START_KEY);
            window.location.replace("acceso-sistema.html");

            throw new Error("La cuenta no tiene un rol asignado.");
        }

        const usuario = {
            id: claims.sub,
            email: claims.email || "",
            role: role,
            name: claims.user_metadata?.full_name ||
                  claims.email || "Usuario"
        };

        comprobarExpiracion(supabase);

        // Comprobar el vencimiento al volver a la pestaña.
        window.addEventListener("focus", function () {
            comprobarExpiracion(supabase);
        });

        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                comprobarExpiracion(supabase);
            }
        });

        // Sincronizar el cierre entre pestañas.
        window.addEventListener("storage", function (event) {
            if (event.key !== SESSION_START_KEY) return;

            if (!event.newValue) {
                if (!isRedirecting) {
                    isRedirecting = true;
                    window.location.replace("acceso-sistema.html");
                }
                return;
            }

            comprobarExpiracion(supabase);
        });

        // Detectar cierres de sesión desde otras pestañas.
        supabase.auth.onAuthStateChange(function (event) {
            if (event === "SIGNED_OUT") {
                localStorage.removeItem(SESSION_START_KEY);

                if (!isRedirecting) {
                    isRedirecting = true;
                    window.location.replace("acceso-sistema.html");
                }
            }
        });

        window.FENIX_USER = usuario;

        document.documentElement.classList.remove("fenix-auth-pending");

        window.dispatchEvent(
            new CustomEvent("fenix:auth-ready", { detail: usuario })
        );

        return usuario;
    }

    window.FENIX_AUTH_READY = iniciarAutenticacion();

    window.FENIX_AUTH_READY.catch(function (error) {
        console.error("No se pudo iniciar Reportes Fénix:", error);
        document.documentElement.classList.remove("fenix-auth-pending");
    });

})();
