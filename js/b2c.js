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