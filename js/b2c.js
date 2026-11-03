// ========================================
// FUNCIONALIDADES DE LA VISTA B2C
// Compatible con navegación SPA y apertura directa.
// ========================================
(function () {
    const REPORTE_AO = "https://app.powerbi.com/view?r=eyJrIjoiMjlkZGY4M2MtZGRjMi00MWViLWI3OWYtOTJiMzAzMzIwMDRmIiwidCI6ImE2ZTVkODdiLWEyNTMtNGMxNS1iNGI3LTQwNTc4YjU5ZDQ5OSIsImMiOjR9";

    function inicializarB2C(contenedor, vistaSolicitada) {
        if (!contenedor) return;

        const iframe = contenedor.querySelector(".powerbi-container iframe");
        const resumenBtn = contenedor.querySelector("#resumenBtn");
        const aoBtn = contenedor.querySelector("#aoReportBtn");
        const tiendasDropdown = contenedor.querySelector(".section-nav-b2c .section-dropdown");
        const tiendasBtn = contenedor.querySelector("#tiendasBtn");
        const titulo = contenedor.querySelector(".powerbi-container .report-header h2");
        const subtitulo = contenedor.querySelector(".powerbi-container .report-header p");
        const tituloPagina = contenedor.querySelector(".page-header-text h1");

        if (!iframe || !resumenBtn || !aoBtn) {
            console.error("La vista B2C no contiene el iframe o los botones requeridos.");
            return;
        }

        // Conservar la URL original aunque el usuario cambie entre reportes.
        if (!contenedor.dataset.reporteB2c) {
            contenedor.dataset.reporteB2c = iframe.getAttribute("src") || "";
        }
        const reporteB2C = contenedor.dataset.reporteB2c;

        function activarBoton(boton) {
            contenedor.querySelectorAll(".section-nav-b2c .section-option").forEach(function (opcion) {
                opcion.classList.remove("active");
            });
            boton.classList.add("active");
        }

        function mostrarReporte(tipo) {
            if (tipo === "ao") {
                if (iframe.getAttribute("src") !== REPORTE_AO) iframe.setAttribute("src", REPORTE_AO);
                activarBoton(aoBtn);
                if (titulo) titulo.textContent = "Reporte AO";
                if (subtitulo) subtitulo.textContent = "Indicadores de AO";
                if (tituloPagina && window.FENIX_USER?.role === "ao") tituloPagina.textContent = "AO";
            } else {
                if (iframe.getAttribute("src") !== reporteB2C) iframe.setAttribute("src", reporteB2C);
                activarBoton(resumenBtn);
                if (titulo) titulo.textContent = "Resumen B2C";
                if (subtitulo) subtitulo.textContent = "Indicadores del canal Retail";
                if (tituloPagina) tituloPagina.textContent = "B2C · Retail";
            }
        }

        // Registrar eventos una sola vez. La vista permanece en memoria al navegar.
        if (!contenedor.dataset.b2cInitialized) {
            aoBtn.addEventListener("click", function () {
                mostrarReporte("ao");
                if (window.FENIX_ROUTER) window.FENIX_ROUTER.updateCurrentQuery("vista", "ao");
            });

            resumenBtn.addEventListener("click", function () {
                mostrarReporte("resumen");
                if (window.FENIX_ROUTER) window.FENIX_ROUTER.updateCurrentQuery("vista", null);
            });

            if (tiendasBtn && tiendasDropdown) {
                tiendasBtn.addEventListener("click", function (event) {
                    event.stopPropagation();
                    const abierto = tiendasDropdown.classList.toggle("is-open");
                    tiendasBtn.setAttribute("aria-expanded", String(abierto));
                });

                document.addEventListener("click", function (event) {
                    if (!tiendasDropdown.contains(event.target)) {
                        tiendasDropdown.classList.remove("is-open");
                        tiendasBtn.setAttribute("aria-expanded", "false");
                    }
                });

                document.addEventListener("keydown", function (event) {
                    if (event.key === "Escape") {
                        tiendasDropdown.classList.remove("is-open");
                        tiendasBtn.setAttribute("aria-expanded", "false");
                    }
                });

                tiendasDropdown.querySelectorAll("[data-store]").forEach(function (opcion) {
                    opcion.addEventListener("click", function () {
                        tiendasDropdown.classList.remove("is-open");
                        tiendasBtn.setAttribute("aria-expanded", "false");
                    });
                });
            }

            contenedor.dataset.b2cInitialized = "true";
        }

        const rol = window.FENIX_USER?.role;
        const esAO = rol === "ao";

        // AO solo dispone de su reporte; B2C y Gerencia pueden alternar ambos.
        contenedor.querySelectorAll(".section-nav-b2c .section-option").forEach(function (boton) {
            boton.hidden = esAO && boton !== aoBtn;
        });
        if (tiendasDropdown) tiendasDropdown.hidden = esAO;

        const vista = esAO ? "ao" : (vistaSolicitada === "ao" ? "ao" : "resumen");
        mostrarReporte(vista);
    }

    window.FENIX_VIEWS = window.FENIX_VIEWS || {};
    window.FENIX_VIEWS.b2c = inicializarB2C;

    // Compatibilidad con la página B2C abierta directamente fuera del SPA.
    document.addEventListener("DOMContentLoaded", function () {
        if (!document.getElementById("appContent")) {
            const main = document.querySelector("main.main-content");
            if (main) {
                const query = new URLSearchParams(window.location.search);
                inicializarB2C(main, query.get("vista"));
            }
        }
    });
})();
