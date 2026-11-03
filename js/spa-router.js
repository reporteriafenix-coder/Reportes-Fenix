// ========================================
// NAVEGACIÓN SPA - REPORTES FÉNIX
// Mantiene el menú y las vistas Power BI montadas.
// ========================================
(function () {
    const ROLE_ROUTES = {
        admin_gerencia: [
            "index.html", "B2B.html", "B2C.html", "Enerbike.html", "BATAS.html", "ECOM.html", "Inventario.html",
            "CerroAlto.html", "Estrella.html", "Galeria.html", "MariscalLopez.html", "MartelSanLorenzo.html",
            "PaseoLambare.html", "ShoppingMariano.html", "ShoppingMariscalLopez.html", "ShoppingPinedo.html",
            "ShoppingSanLorenzo.html", "TOLuque.html", "TOSur.html", "Tiendas_prueba.html", "Tiendas_retail.html"
        ],
        b2b: ["index.html", "B2B.html", "Inventario.html"],
        b2c: [
            "index.html", "B2C.html", "Enerbike.html", "Inventario.html", "CerroAlto.html", "Estrella.html",
            "Galeria.html", "MariscalLopez.html", "MartelSanLorenzo.html", "PaseoLambare.html",
            "ShoppingMariano.html", "ShoppingMariscalLopez.html", "ShoppingPinedo.html",
            "ShoppingSanLorenzo.html", "TOLuque.html", "TOSur.html", "Tiendas_prueba.html", "Tiendas_retail.html"
        ],
        ao: ["index.html", "B2C.html", "Inventario.html"]
    };

    const ROUTE_TITLES = {
        "index.html": "Panel Integral",
        "B2C.html": "B2C · Retail",
        "B2B.html": "B2B · Uniformes y Mayoristas",
        "Enerbike.html": "Enerbike",
        "BATAS.html": "Batas",
        "ECOM.html": "ECOM",
        "Inventario.html": "Inventario",
        "CerroAlto.html": "Cerro Alto",
        "Estrella.html": "Estrella",
        "Galeria.html": "Galería",
        "MariscalLopez.html": "Mariscal López",
        "MartelSanLorenzo.html": "Martel San Lorenzo",
        "PaseoLambare.html": "Paseo Lambaré",
        "ShoppingMariano.html": "Shopping Mariano",
        "ShoppingMariscalLopez.html": "Shopping Mariscal López",
        "ShoppingPinedo.html": "Shopping Pinedo",
        "ShoppingSanLorenzo.html": "Shopping San Lorenzo",
        "TOLuque.html": "TO Luque",
        "TOSur.html": "TO Sur",
        "Tiendas_prueba.html": "Tiendas",
        "Tiendas_retail.html": "Tiendas Retail"
    };

    const ROUTES = new Set(Object.keys(ROUTE_TITLES));
    const cache = new Map();
    let activePage = "index.html";
    let activeQuery = new URLSearchParams();
    let navigating = false;

    function currentRole() {
        return window.FENIX_USER?.role || "";
    }

    function normalizeRoute(url) {
        let page = decodeURIComponent(url.pathname.split("/").pop() || "index.html");
        if (!page.endsWith(".html")) page = "index.html";
        const query = new URLSearchParams(url.search);
        if (currentRole() === "ao" && page === "B2C.html") query.set("vista", "ao");
        return { page, query };
    }

    function isAllowed(page, query) {
        const role = currentRole();
        const permitted = ROLE_ROUTES[role] || [];
        if (!permitted.includes(page)) return false;
        if (role === "ao" && page === "B2C.html" && query.get("vista") !== "ao") return false;
        return true;
    }

    function routeHash(route) {
        const search = route.query.toString();
        return `#${route.page}${search ? `?${search}` : ""}`;
    }

    function routeFromHash() {
        const raw = window.location.hash.replace(/^#/, "");
        if (!raw) return { page: "index.html", query: new URLSearchParams() };
        const parsed = new URL(raw, window.location.origin + window.location.pathname);
        return normalizeRoute(parsed);
    }

    function makeActiveMenu(route) {
        const menu = document.querySelector(".sidebar .menu");
        if (!menu) return;

        menu.querySelectorAll("a[href]").forEach(function (link) {
            link.classList.remove("active");
        });
        menu.querySelectorAll(".menu-parent-row").forEach(function (row) {
            row.classList.remove("active");
        });

        const routeForActive = route.page;
        if (route.page === "B2C.html") {
            const parent = menu.querySelector('.menu-parent-row > a[href^="B2C.html"]');
            if (parent) {
                parent.classList.add("active");
                parent.closest(".menu-parent-row")?.classList.add("active");
            }
            const aoLink = menu.querySelector("#aoMenuLink");
            if (aoLink && route.query.get("vista") === "ao") aoLink.classList.add("active");
        } else {
            const active = Array.from(menu.querySelectorAll("a[href]")).find(function (link) {
                const href = link.getAttribute("href") || "";
                return href.split("?")[0].split("#")[0].split("/").pop() === routeForActive;
            });
            if (active) active.classList.add("active");
        }

        const group = menu.querySelector(".menu-group-b2c");
        const toggle = menu.querySelector("#b2cSubmenuToggle");
        const shouldOpen = route.page === "B2C.html" || route.page === "Enerbike.html";
        if (group && currentRole() !== "ao") {
            group.classList.toggle("is-open", shouldOpen);
            toggle?.setAttribute("aria-expanded", String(shouldOpen));
        }
    }

    function applyRoleMenu() {
        const menu = document.querySelector(".sidebar .menu");
        if (!menu) return;

        const role = currentRole();
        const group = menu.querySelector(".menu-group-b2c");
        const b2cParent = menu.querySelector("#b2cParentLink");
        const toggle = menu.querySelector("#b2cSubmenuToggle");
        const submenu = menu.querySelector("#b2cSubmenu");
        const enerbike = menu.querySelector('a[href="Enerbike.html"]');
        const aoLink = menu.querySelector("#aoMenuLink");
        const b2b = menu.querySelector('a[href="B2B.html"]');
        const batas = menu.querySelector('a[href="BATAS.html"]');

        // Opciones compartidas para todos los roles.
        const panel = menu.querySelector('a[href="index.html"]');
        const inventario = menu.querySelector('a[href="Inventario.html"]');
        if (panel) panel.hidden = false;
        if (inventario) inventario.hidden = false;

        if (group) group.hidden = !(role === "admin_gerencia" || role === "b2c" || role === "ao");
        if (b2b) b2b.hidden = !(role === "admin_gerencia" || role === "b2b");
        if (batas) batas.hidden = role !== "admin_gerencia";

        if (role === "ao") {
            if (b2cParent) {
                b2cParent.href = "B2C.html?vista=ao";
                const label = b2cParent.querySelector(".menu-label");
                if (label) label.textContent = "AO";
            }
            if (toggle) toggle.hidden = true;
            if (submenu) submenu.hidden = true;
            if (enerbike) enerbike.hidden = true;
            if (aoLink) aoLink.hidden = true;
        } else {
            if (b2cParent) {
                b2cParent.href = "B2C.html";
                const label = b2cParent.querySelector(".menu-label");
                if (label) label.textContent = "B2C · Retail";
            }
            if (toggle) toggle.hidden = false;
            if (submenu) submenu.hidden = false;
            if (enerbike) enerbike.hidden = role !== "admin_gerencia" && role !== "b2c";
            if (aoLink) aoLink.hidden = role !== "admin_gerencia" && role !== "b2c";
        }

        // En Panel Integral, ocultar tarjetas de módulos que el rol no puede abrir.
        const moduleCards = document.querySelectorAll(".module-grid .module-card[href]");
        moduleCards.forEach(function (card) {
            const page = (card.getAttribute("href") || "").split("?")[0].split("/").pop();
            card.hidden = !isAllowed(page, new URLSearchParams());
        });
    }

    function cleanMarkup(root) {
        root.querySelectorAll("script, style, link, meta, title").forEach(el => el.remove());
        return root.innerHTML;
    }

    function buildLegacyMarkup(doc, page) {
        const label = ROUTE_TITLES[page] || page.replace(/\.html$/i, "");
        const oldHeader = doc.querySelector("header");
        const oldHeading = oldHeader?.querySelector("h1")?.textContent?.trim() || label;
        const oldDescription = oldHeader?.querySelector("p")?.textContent?.trim() || "Indicadores generales";
        const oldIframe = doc.querySelector(".container iframe, iframe");
        let reportContent = "";

        if (oldIframe) {
            const src = oldIframe.getAttribute("src") || "";
            if (/^https?:\/\//i.test(src)) {
                const iframe = oldIframe.cloneNode(false);
                iframe.removeAttribute("width");
                iframe.removeAttribute("height");
                iframe.setAttribute("allowfullscreen", "true");
                reportContent = iframe.outerHTML;
            }
        }

        if (!reportContent) {
            reportContent = `<div class="report-placeholder"><h3>Reporte ${label}</h3><p>El reporte estará disponible próximamente.</p></div>`;
        }

        return `
            <div class="page-header">
                <div class="page-header-text">
                    <h1>${label}</h1>
                    <p>Bienvenido/a, <span id="nombreUsuario"></span></p>
                </div>
                <div class="page-brand">
                    <img src="img/Fenix Brands Logo-02.png" alt="Fénix Brands">
                </div>
            </div>
            <section class="powerbi-container">
                <div class="report-header">
                    <div><h2>${oldHeading}</h2><p>${oldDescription}</p></div>
                </div>
                ${reportContent}
            </section>
        `;
    }

    async function crearVista(page) {
        const response = await fetch(page, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`No se pudo cargar ${page} (${response.status}).`);

        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const pageMain = parsed.querySelector("main.main-content");
        const markup = pageMain ? cleanMarkup(pageMain) : buildLegacyMarkup(parsed, page);

        const view = document.createElement("section");
        view.className = "spa-view";
        view.dataset.page = page;
        view.hidden = true;
        view.innerHTML = markup;
        document.getElementById("appContent").appendChild(view);
        cache.set(page, view);
        return view;
    }

    async function getView(page) {
        if (cache.has(page)) return cache.get(page);
        return crearVista(page);
    }

    function inicializarVista(route, view) {
        const nombreUsuario = view.querySelector("#nombreUsuario");
        if (nombreUsuario) {
            nombreUsuario.textContent = window.FENIX_USER?.name || window.FENIX_USER?.email || "Usuario";
        }

        if (route.page === "B2C.html" && window.FENIX_VIEWS?.b2c) {
            window.FENIX_VIEWS.b2c(view, route.query.get("vista"));
        }
        document.title = `${ROUTE_TITLES[route.page] || "Reportes Fénix"} | Fénix Brands`;
    }

    async function navegar(route, pushState) {
        if (navigating) return;
        if (!ROUTES.has(route.page)) {
            console.warn("Ruta no registrada en el portal:", route.page);
            return;
        }
        if (!isAllowed(route.page, route.query)) {
            alert("No tenés permiso para acceder a esa sección.");
            // Ante un acceso no permitido, todos vuelven al Panel Integral.
            return navegar({ page: "index.html", query: new URLSearchParams() }, true);
        }

        navigating = true;
        try {
            // Mantener la vista actual visible hasta que la siguiente esté lista.
            const nextView = await getView(route.page);
            document.querySelectorAll("#appContent > .spa-view").forEach(function (view) {
                view.hidden = view !== nextView;
            });

            activePage = route.page;
            activeQuery = new URLSearchParams(route.query);
            inicializarVista(route, nextView);
            makeActiveMenu(route);
            applyRoleMenu();

            if (pushState) {
                const hash = routeHash(route);
                if (window.location.hash !== hash) {
                    window.history.pushState({ fenixRoute: true }, "", hash);
                }
            }
        } catch (error) {
            console.error("Error al cambiar de módulo:", error);
            alert("No se pudo abrir esta sección. Revisá tu conexión e intentá nuevamente.");
        } finally {
            navigating = false;
        }
    }

    function parseAnchor(anchor) {
        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return null;
        const page = decodeURIComponent(url.pathname.split("/").pop() || "index.html");
        if (!ROUTES.has(page)) return null;
        return normalizeRoute(url);
    }

    async function iniciarRouter() {
        await window.FENIX_AUTH_READY;

        const host = document.getElementById("appContent");
        if (!host) throw new Error("No se encontró el contenedor principal del portal.");

        const initialView = host.querySelector('.spa-view[data-page="index.html"]');
        if (initialView) cache.set("index.html", initialView);

        applyRoleMenu();

        const menuToggle = document.getElementById("b2cSubmenuToggle");
        const menuGroup = document.querySelector(".menu-group-b2c");
        if (menuToggle && menuGroup) {
            menuToggle.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (menuGroup.hidden) return;
                const open = menuGroup.classList.toggle("is-open");
                menuToggle.setAttribute("aria-expanded", String(open));
            });
        }

        document.addEventListener("click", function (event) {
            const anchor = event.target.closest("a[href]");
            if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
            const route = parseAnchor(anchor);
            if (!route) return;
            event.preventDefault();
            navegar(route, true);
        });

        window.addEventListener("popstate", function () {
            navegar(routeFromHash(), false);
        });

        const initialRoute = routeFromHash();
        await navegar(initialRoute, false);
        // Actualizar menú tras la primera vista, sin reconstruir la sesión.
        applyRoleMenu();
    }

    window.FENIX_ROUTER = {
        navigate: function (href) {
            const url = new URL(href, window.location.href);
            return navegar(normalizeRoute(url), true);
        },
        updateCurrentQuery: function (key, value) {
            const query = new URLSearchParams(activeQuery);
            if (value === null || value === undefined || value === "") query.delete(key);
            else query.set(key, value);
            const route = { page: activePage, query };
            const hash = routeHash(route);
            window.history.replaceState({ fenixRoute: true }, "", hash);
            activeQuery = query;
        }
    };

    iniciarRouter().catch(function (error) {
        console.error("No se pudo iniciar la navegación de Reportes Fénix:", error);
    });
})();
