// ========================================
// DATOS DEL USUARIO Y CIERRE DE SESIÓN
// ========================================
(async function () {
    try {
        if (window.FENIX_AUTH_READY) {
            await window.FENIX_AUTH_READY;
        }

        const nombreUsuario = document.getElementById("nombreUsuario");
        if (nombreUsuario) {
            nombreUsuario.textContent =
                window.FENIX_USER?.name ||
                window.FENIX_USER?.email ||
                "Usuario";
        }

        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn && !logoutBtn.dataset.logoutBound) {
            logoutBtn.dataset.logoutBound = "true";
            logoutBtn.addEventListener("click", async function () {
                logoutBtn.disabled = true;
                try {
                    if (window.fenixSupabase) {
                        await window.fenixSupabase.auth.signOut({ scope: "local" });
                    }
                } catch (error) {
                    console.error("Error al cerrar sesión:", error);
                } finally {
                    window.location.replace("acceso-sistema.html");
                }
            });
        }
    } catch (error) {
        console.error("No se pudo inicializar el panel:", error);
    }
})();
