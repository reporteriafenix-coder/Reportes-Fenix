document.addEventListener("DOMContentLoaded", function () {
    const dropdown = document.querySelector(
        ".section-nav-b2c .section-dropdown"
    );

    const button = document.getElementById("tiendasBtn");

    if (!dropdown || !button) {
        return;
    }

    function cerrarTiendas() {
        dropdown.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
    }

    button.addEventListener("click", function (event) {
        event.stopPropagation();

        const abierto = dropdown.classList.toggle("is-open");

        button.setAttribute("aria-expanded", String(abierto));
    });

    document.addEventListener("click", function (event) {
        if (!dropdown.contains(event.target)) {
            cerrarTiendas();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            cerrarTiendas();
        }
    });

    dropdown.querySelectorAll("[data-store]").forEach(function (opcion) {
        opcion.addEventListener("click", cerrarTiendas);
    });
});

// ========================================
// SUBMENÚ LATERAL B2C: AO Y ENERBIKE
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    const grupoB2C = document.querySelector(".menu-group-b2c");
    const botonSubmenu = document.getElementById("b2cSubmenuToggle");
    const submenu = document.getElementById("b2cSubmenu");

    

    if (!grupoB2C || !botonSubmenu || !submenu) {
        return;
    }

    function cerrarSubmenu() {
        grupoB2C.classList.remove("is-open");
        botonSubmenu.setAttribute("aria-expanded", "false");
    }

    // Abrir AO y Enerbike al cargar B2C
grupoB2C.classList.add("is-open");
botonSubmenu.setAttribute("aria-expanded", "true");

    

    // Abrir o cerrar al pulsar la flecha
    botonSubmenu.addEventListener("click", function (event) {
        event.stopPropagation();

        const abierto = grupoB2C.classList.toggle("is-open");

        botonSubmenu.setAttribute(
            "aria-expanded",
            String(abierto)
        );
    });

    // Cerrar al hacer clic fuera del grupo B2C
    document.addEventListener("click", function (event) {
        if (!grupoB2C.contains(event.target)) {
            cerrarSubmenu();
        }
    });

    // Cerrar con Escape
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            cerrarSubmenu();
        }
    });

});