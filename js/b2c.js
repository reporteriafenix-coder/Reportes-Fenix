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
// CAMBIAR REPORTE: RESUMEN B2C Y AO
// ========================================

document.addEventListener("DOMContentLoaded", function () {
    const iframe = document.querySelector(
        ".powerbi-container iframe"
    );

    const resumenBtn = document.getElementById("resumenBtn");
    const aoBtn = document.getElementById("aoReportBtn");

    const titulo = document.querySelector(
        ".powerbi-container .report-header h2"
    );

    const subtitulo = document.querySelector(
        ".powerbi-container .report-header p"
    );

    const reporteB2C =
        "https://app.powerbi.com/view?r=eyJrIjoiZTIzY2ZjMWItM2I1Yi00NTFiLWFlNWEtOGZkMWJhYTU0YzZhIiwidCI6ImE2ZTVkODdiLWEyNTMtNGMxNS1iNGI3LTQwNTc4YjU5ZDQ5OSIsImMiOjR9";

    const reporteAO =
        "https://app.powerbi.com/view?r=eyJrIjoiMjlkZGY4M2MtZGRjMi00MWViLWI3OWYtOTJiMzAzMzIwMDRmIiwidCI6ImE2ZTVkODdiLWEyNTMtNGMxNS1iNGI3LTQwNTc4YjU5ZDQ5OSIsImMiOjR9";

    if (!iframe || !resumenBtn || !aoBtn) {
        return;
    }

    function activarBoton(boton) {
        document.querySelectorAll(
            ".section-nav-b2c .section-option"
        ).forEach(function (opcion) {
            opcion.classList.remove("active");
        });

        boton.classList.add("active");
    }

    aoBtn.addEventListener("click", function () {
        iframe.src = reporteAO;

        activarBoton(aoBtn);

        if (titulo) titulo.textContent = "Reporte AO";
        if (subtitulo) subtitulo.textContent = "Indicadores de AO";
    });

    resumenBtn.addEventListener("click", function () {
        iframe.src = reporteB2C;

        activarBoton(resumenBtn);

        if (titulo) titulo.textContent = "Resumen B2C";
        if (subtitulo) {
            subtitulo.textContent = "Indicadores del canal Retail";
        }
    });
});