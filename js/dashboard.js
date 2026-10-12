// ================================
// INFORMACIÓN DEL USUARIO
// ================================

const usuarioActual = localStorage.getItem("usuario");

const nombreUsuario = document.getElementById("nombreUsuario");

if (nombreUsuario) {
    nombreUsuario.textContent = usuarioActual || "Usuario";
}


// ================================
// CERRAR SESIÓN
// ================================

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
        localStorage.removeItem("usuario");
        localStorage.removeItem("rol");

        window.location.href = "acceso-sistema.html";
    });
}