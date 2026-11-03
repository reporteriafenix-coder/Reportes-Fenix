
// ========================================
// LOGIN SEGURO - REPORTES FÉNIX
// ========================================

window.login = async function () {
    const email = document.getElementById("usuario").value
        .trim()
        .toLowerCase();

    const password = document.getElementById("password").value;
    const errorElement = document.getElementById("error");
    const boton = document.querySelector(".login-box button");

    errorElement.textContent = "";

    if (!email || !password) {
        errorElement.textContent = "Ingresá tu correo y contraseña.";
        return;
    }

    if (!window.fenixSupabase) {
        errorElement.textContent = "No se pudo conectar con el sistema.";
        return;
    }

    boton.disabled = true;
    boton.textContent = "Verificando...";

    try {
        // 1. Autenticar mediante Supabase
        const { data, error } =
            await window.fenixSupabase.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (error) {
            throw new Error("Correo o contraseña incorrectos.");
        }

        // 2. Consultar el rol asignado al usuario
        const { data: registro, error: errorRol } =
            await window.fenixSupabase
                .from("user_roles")
                .select("role")
                .eq("user_id", data.user.id)
                .single();

        if (errorRol || !registro) {
            await window.fenixSupabase.auth.signOut({
                scope: "local"
            });

            console.error("Error consultando rol:", errorRol);

            throw new Error(
                "Tu cuenta no tiene un rol asignado. Contactá al administrador."
            );
        }

        // 3. Validar que el rol esté habilitado.
        const rolesHabilitados = ["admin_gerencia", "b2b", "b2c", "ao"];

        if (!rolesHabilitados.includes(registro.role)) {
            await window.fenixSupabase.auth.signOut({ scope: "local" });
            throw new Error("Tu rol no está habilitado.");
        }

        // 4. Todos los usuarios comienzan en Panel Integral.
        // El rol sigue controlando qué módulos pueden abrir desde el menú.
        window.location.replace("index.html");

    } catch (error) {
        console.error("Error de acceso:", error);
        errorElement.textContent =
            error.message || "No se pudo iniciar sesión.";

    } finally {
        boton.disabled = false;
        boton.textContent = "Entrar";
    }
};
