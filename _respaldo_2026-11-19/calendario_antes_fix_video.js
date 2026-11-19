
/* ==========================================
   CALENDARIO DE ACTIVIDADES - FÉNIX BRANDS
   Integración con Supabase y Router SPA
========================================== */

(function () {
    "use strict";

    const BUCKET = "calendar-attachments";

    const CATEGORIES = {
        campana: "Campaña",
        contenido: "Contenido",
        publicacion: "Publicación",
        lanzamiento: "Lanzamiento",
        feria: "Feria",
        activacion: "Activación",
        entrega: "Entrega",
        fecha_comercial: "Fecha comercial",
        sucursal: "Sucursal"
    };

    const STATUSES = {
        planificado: "Planificado",
        en_progreso: "En progreso",
        completado: "Completado",
        cancelado: "Cancelado"
    };

    let root;
    let supabase;
    let user;
    let role;

    let events = [];
    let brands = [];
    let branches = [];
    let responsibles = [];
    let eventNotifications = [];

    let currentDate = new Date();
    let selectedDate = new Date();
    let currentView = "month";
    let selectedEventId = null;
    let editingEventId = null;

    let initialized = false;
    let loading = false;

    // Estado del importador Excel
let importPreviewEvents = [];
let importPreviewFilter = "all";
let importInProgress = false;
let importIgnoredRows = [];
let xlsxLoadingPromise = null;

    // Estado del arrastre de eventos
let draggedCalendarEvent = null;
let resizeState = null;
let ignoreCalendarClickUntil = 0;
let calendarDragInProgress = false;

    // ESTADO DEL EDITOR DE IMÁGENES

let cropQueue = [];
let cropIndex = 0;
let cropBatchResults = [];
let croppedFiles = [];

let cropImage = null;
let cropObjectUrl = null;

let cropZoom = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;

let cropDragging = false;
let cropLastPointerX = 0;
let cropLastPointerY = 0;

    const filters = {
        brands: null,
        categories: null,
        branches: null,
        responsible: "all"
    };

    const $ = selector => root.querySelector(selector);

    const $$ = selector => Array.from(root.querySelectorAll(selector));

   


/* ======================================
   VENTANA DE CONFIRMACIÓN (reemplaza confirm())
   Devuelve una promesa: true = Aceptar, false = Cancelar.
====================================== */

function calConfirm({
    title = "¿Confirmás esta acción?",
    message = "",
    confirmText = "Aceptar",
    cancelText = "Cancelar",
    tone = "primary"
} = {}) {

    return new Promise(resolve => {

        const previousFocus = document.activeElement;

        const overlay = document.createElement("div");
        overlay.className = "cal-confirm";
        overlay.innerHTML = `
            <div class="cal-confirm-backdrop" data-confirm="cancel"></div>

            <section class="cal-confirm-card tone-${escapeHTML(tone)}"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="calConfirmTitle"
                aria-describedby="calConfirmMessage">

                <div class="cal-confirm-icon" aria-hidden="true">
                    ${tone === "danger" ? "!" : "↑"}
                </div>

                <div class="cal-confirm-text">
                    <h3 id="calConfirmTitle">${escapeHTML(title)}</h3>
                    ${message
                        ? `<p id="calConfirmMessage">${escapeHTML(message)}</p>`
                        : ""}
                </div>

                <div class="cal-confirm-actions">
                    <button type="button" class="cal-confirm-cancel"
                        data-confirm="cancel">${escapeHTML(cancelText)}</button>
                    <button type="button" class="cal-confirm-ok"
                        data-confirm="ok">${escapeHTML(confirmText)}</button>
                </div>
            </section>
        `;

        (root || document.body).appendChild(overlay);

        const okButton = overlay.querySelector(".cal-confirm-ok");
        const cancelButton = overlay.querySelector(".cal-confirm-cancel");

        requestAnimationFrame(() => {
            overlay.classList.add("is-open");
            okButton.focus();
        });

        function close(result) {
            document.removeEventListener("keydown", onKey, true);
            overlay.classList.remove("is-open");

            setTimeout(() => overlay.remove(), 160);

            if (previousFocus?.focus) previousFocus.focus();

            resolve(result);
        }

        function onKey(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(false);
            }

            // Mantener el foco dentro de la ventana.
            if (event.key === "Tab") {
                const target = document.activeElement === okButton
                    ? cancelButton
                    : okButton;

                event.preventDefault();
                target.focus();
            }
        }

        document.addEventListener("keydown", onKey, true);

        overlay.addEventListener("click", event => {
            const action = event.target.closest("[data-confirm]");
            if (!action) return;
            close(action.dataset.confirm === "ok");
        });
    });
}


/* ======================================
   VENTANA "+N MÁS": TODOS LOS EVENTOS DEL DÍA
====================================== */

function closeDayEventsPopover() {
    const popover = document.querySelector(".cal-day-popover");
    if (!popover) return;

    popover._cleanup?.();
    popover.remove();
}

function openDayEventsPopover(anchor) {

    closeDayEventsPopover();

    const dayKey = anchor.dataset.moreDate;
    const day = new Date(`${dayKey}T00:00:00`);

    const dayEvents = getFilteredEvents()
        .filter(event => eventOverlaps(event, day, day))
        .sort((a, b) =>
            new Date(a.start_at) - new Date(b.start_at) ||
            String(a.title).localeCompare(String(b.title))
        );

    const title = new Intl.DateTimeFormat("es-PY", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(day);

    const popover = document.createElement("div");
    popover.className = "cal-day-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", `Eventos del ${title}`);

    popover.innerHTML = `
        <header>
            <strong>${escapeHTML(title.charAt(0).toUpperCase() + title.slice(1))}</strong>
            <span>${dayEvents.length} eventos</span>
            <button type="button" class="cal-day-popover-close"
                aria-label="Cerrar">×</button>
        </header>

        <div class="cal-day-popover-list">
            ${dayEvents.map(event => `
                <button type="button"
                    class="cal-event-chip category-${escapeHTML(event.category)}"
                    data-popover-event="${escapeHTML(event.id)}"
                    title="${escapeHTML(event.title)}">
                    ${escapeHTML(event.title)}
                </button>
            `).join("")}
        </div>
    `;

    (root || document.body).appendChild(popover);

    // Ubicar la ventana junto a la casilla del día.
    const cell = anchor.closest(".cal-day") || anchor;
    const rect = cell.getBoundingClientRect();
    const width = Math.max(rect.width + 60, 300);

    popover.style.width = `${width}px`;

    const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 12
    );

    const height = popover.offsetHeight;
    const top = rect.top + height + 12 > window.innerHeight
        ? Math.max(12, window.innerHeight - height - 12)
        : rect.top;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    popover.querySelector(".cal-day-popover-close")
        .focus({ preventScroll: true });

    popover.addEventListener("click", event => {

        if (event.target.closest(".cal-day-popover-close")) {
            closeDayEventsPopover();
            return;
        }

        const item = event.target.closest("[data-popover-event]");

        if (item) {
            closeDayEventsPopover();
            selectEvent(item.dataset.popoverEvent);
        }
    });

    const onOutside = event => {
        if (!popover.contains(event.target) &&
            !event.target.closest("[data-more-date]")) {
            closeDayEventsPopover();
        }
    };

    const onKey = event => {
        if (event.key === "Escape") closeDayEventsPopover();
    };

    const onScroll = () => closeDayEventsPopover();

    // Escuchar después de abrir, para que el mismo clic
    // no cierre la ventana.
    setTimeout(() => {
        if (!popover.isConnected) return;
        document.addEventListener("click", onOutside, true);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onScroll);
    }, 150);

    popover._cleanup = () => {
        document.removeEventListener("click", onOutside, true);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
    };
}


/* ======================================
   FECHAS CORTAS: "jue 5 nov"
====================================== */

function formatShortDate(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);

    return new Intl.DateTimeFormat("es-PY", {
        weekday: "short",
        day: "numeric",
        month: "short"
    }).format(date).replace(/[.,]/g, "");
}


/* ======================================
   VISTA PREVIA AL MOVER O ESTIRAR
====================================== */

function showRangePreview(startKey, endKey, anchorCell, label) {

    $$(".cal-day[data-date]").forEach(cell => {
        const key = cell.dataset.date;
        cell.classList.toggle(
            "is-range-preview",
            key >= startKey && key <= endKey
        );
    });

    let tip = document.querySelector(".cal-range-tip");

    if (!tip) {
        tip = document.createElement("div");
        tip.className = "cal-range-tip";
        (root || document.body).appendChild(tip);
    }

    tip.textContent = label;

    const rect = anchorCell.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
}

function showRangeTip(anchorCell, label) {

    let tip = document.querySelector(".cal-range-tip");

    if (!tip) {
        tip = document.createElement("div");
        tip.className = "cal-range-tip";
        (root || document.body).appendChild(tip);
    }

    tip.textContent = label;

    const rect = anchorCell.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
}

function clearRangePreview() {
    $$(".cal-day.is-range-preview").forEach(cell =>
        cell.classList.remove("is-range-preview")
    );

    document.querySelector(".cal-range-tip")?.remove();
}


/* ======================================
   VENTANITA RÁPIDA DE FECHAS (clic en un evento)
====================================== */

function closeQuickDatesPopover() {
    const popover = document.querySelector(".cal-quick-dates");
    if (!popover) return;

    popover._cleanup?.();
    popover.remove();

    $$(".cal-event-chip.is-active").forEach(chip =>
        chip.classList.remove("is-active")
    );
}

function openQuickDatesPopover(chip) {

    closeQuickDatesPopover();
    closeDayEventsPopover();

    const calendarEvent = events.find(item => item.id === chip.dataset.eventId);
    if (!calendarEvent) return;

    const originalStart = inputDate(calendarEvent.start_at);
    const originalEnd = calendarEvent.end_at
        ? inputDate(calendarEvent.end_at)
        : originalStart;

    let startKey = originalStart;
    let endKey = originalEnd;

    $$(`.cal-event-chip[data-event-id="${CSS.escape(calendarEvent.id)}"]`)
        .forEach(item => item.classList.add("is-active"));

    const popover = document.createElement("div");
    popover.className = "cal-quick-dates";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", `Fechas de ${calendarEvent.title}`);

    popover.innerHTML = `
        <header>
            <div>
                <strong>${escapeHTML(calendarEvent.title)}</strong>
                <span data-quick-summary></span>
            </div>
            <button type="button" class="cal-quick-close" aria-label="Cerrar">×</button>
        </header>

        ${["start", "end"].map(edge => `
            <div class="cal-quick-row">
                <label for="calQuick-${edge}">${edge === "start" ? "Inicio" : "Fin"}</label>
                <div class="cal-quick-stepper">
                    <button type="button" data-quick-step="${edge}" data-days="-1"
                        aria-label="Un día antes">−</button>
                    <input type="date" id="calQuick-${edge}" data-quick-input="${edge}">
                    <button type="button" data-quick-step="${edge}" data-days="1"
                        aria-label="Un día después">+</button>
                </div>
            </div>
        `).join("")}

        <p class="cal-quick-error" data-quick-error hidden></p>

        <footer>
            <button type="button" class="cal-quick-detail">Ver ficha</button>
            <button type="button" class="cal-quick-save">Guardar</button>
        </footer>
    `;

    (root || document.body).appendChild(popover);

    const startInput = popover.querySelector('[data-quick-input="start"]');
    const endInput = popover.querySelector('[data-quick-input="end"]');
    const saveButton = popover.querySelector(".cal-quick-save");
    const errorText = popover.querySelector("[data-quick-error]");
    const summary = popover.querySelector("[data-quick-summary]");

    const categoryLabel = CATEGORIES[calendarEvent.category] || "Evento";

    function update() {
        startInput.value = startKey;
        endInput.value = endKey;

        const valid = startKey && endKey && startKey <= endKey;
        const days = valid ? calendarDayOffset(startKey, endKey) + 1 : 0;
        const changed = startKey !== originalStart || endKey !== originalEnd;

        summary.textContent = valid
            ? `${categoryLabel} · ${days} ${days === 1 ? "día" : "días"}`
            : categoryLabel;

        errorText.hidden = valid;
        errorText.textContent = valid
            ? ""
            : "El inicio no puede quedar después del fin.";

        saveButton.disabled = !valid || !changed;
    }

    update();

    // Ubicar junto a la barra del evento.
    const rect = chip.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;

    let left = rect.left;
    left = Math.min(Math.max(12, left), window.innerWidth - width - 12);

    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - height - 8);
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    popover.addEventListener("click", async event => {

        if (event.target.closest(".cal-quick-close")) {
            closeQuickDatesPopover();
            return;
        }

        const step = event.target.closest("[data-quick-step]");

        if (step) {
            const days = Number(step.dataset.days);

            // Inicio: solo se mueve el inicio. Fin: solo se mueve el fin.
            if (step.dataset.quickStep === "start") {
                startKey = shiftCalendarDate(startKey, days);
            } else {
                endKey = shiftCalendarDate(endKey, days);
            }

            update();
            return;
        }

        if (event.target.closest(".cal-quick-detail")) {
            closeQuickDatesPopover();
            selectEvent(calendarEvent.id);
            return;
        }

        if (event.target.closest(".cal-quick-save") && !saveButton.disabled) {
            saveButton.disabled = true;
            saveButton.textContent = "Guardando...";

            await moveCalendarEvent(calendarEvent.id, startKey, endKey, "set");

            closeQuickDatesPopover();
        }
    });

    popover.addEventListener("change", event => {
        const input = event.target.closest("[data-quick-input]");
        if (!input || !input.value) return;

        if (input.dataset.quickInput === "start") startKey = input.value;
        else endKey = input.value;

        update();
    });

    const onOutside = event => {
        if (!popover.contains(event.target) &&
            !event.target.closest(".cal-event-chip")) {
            closeQuickDatesPopover();
        }
    };

    const onKey = event => {
        if (event.key === "Escape") closeQuickDatesPopover();
    };

    setTimeout(() => {
        if (!popover.isConnected) return;
        document.addEventListener("click", onOutside, true);
        document.addEventListener("keydown", onKey);
    }, 150);

    popover._cleanup = () => {
        document.removeEventListener("click", onOutside, true);
        document.removeEventListener("keydown", onKey);
    };

    saveButton.focus({ preventScroll: true });
}


/* ======================================
   COLORES POR CATEGORÍA (personalizables)
   Se guardan en este navegador (localStorage).
====================================== */

const CATEGORY_COLORS_KEY = "fenix_calendar_category_colors";

const DEFAULT_CATEGORY_COLORS = {
    campana: "#8244c5",
    contenido: "#3285c7",
    publicacion: "#2a9d8f",
    lanzamiento: "#c18b19",
    feria: "#d74747",
    activacion: "#159b68",
    entrega: "#536779",
    fecha_comercial: "#e07a1f",
    sucursal: "#c2477f"
};

const COLOR_SWATCHES = [
    "#8244c5", "#5b5fd6", "#3285c7", "#2a9d8f", "#159b68",
    "#6b8e23", "#c18b19", "#e07a1f", "#d74747", "#c2477f",
    "#536779", "#153b60"
];

function getCategoryColors() {
    try {
        const saved = JSON.parse(localStorage.getItem(CATEGORY_COLORS_KEY) || "{}");
        return { ...DEFAULT_CATEGORY_COLORS, ...saved };
    } catch {
        return { ...DEFAULT_CATEGORY_COLORS };
    }
}

function saveCategoryColor(category, color) {
    try {
        const saved = JSON.parse(localStorage.getItem(CATEGORY_COLORS_KEY) || "{}");

        if (color) saved[category] = color;
        else delete saved[category];

        localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(saved));
    } catch (error) {
        console.warn("No se pudieron guardar los colores:", error);
    }
}

function mixHex(hex, target, amount) {
    const from = hex.replace("#", "").match(/../g).map(v => parseInt(v, 16));
    const to = target.replace("#", "").match(/../g).map(v => parseInt(v, 16));

    return "#" + from.map((v, i) =>
        Math.round(v + (to[i] - v) * amount).toString(16).padStart(2, "0")
    ).join("");
}

function applyCategoryColors() {

    const colors = getCategoryColors();

    const css = Object.entries(colors).map(([category, accent]) => `
        .fenix-calendar .cal-event-chip.category-${category} {
            --chip-ac: ${accent};
            --chip-bg: ${mixHex(accent, "#ffffff", 0.86)};
            --chip-fg: ${mixHex(accent, "#000000", 0.42)};
            background: var(--chip-bg);
        }
        #fenixCalendar .cal-legend-dot.category-${category} {
            background: ${accent};
        }
    `).join("");

    let style = document.getElementById("calCategoryColors");

    if (!style) {
        style = document.createElement("style");
        style.id = "calCategoryColors";
        document.head.appendChild(style);
    }

    style.textContent = css;
}

function renderLegend() {

    const legend = $("#calLegend");
    if (!legend) return;

    legend.innerHTML = `
        <div class="cal-legend-items">
            ${Object.entries(CATEGORIES).map(([value, label]) => `
                <span class="cal-legend-item">
                    <span class="cal-legend-dot category-${value}"></span>
                    ${escapeHTML(label)}
                </span>
            `).join("")}
        </div>

        <button type="button" class="cal-legend-edit" data-edit-colors>
            🎨 Personalizar colores
        </button>
    `;
}

function closeColorsPanel() {
    const panel = document.querySelector(".cal-colors-panel");
    if (!panel) return;

    panel._cleanup?.();
    panel.remove();
}

function openColorsPanel(anchor) {

    closeColorsPanel();

    const colors = getCategoryColors();

    const panel = document.createElement("div");
    panel.className = "cal-colors-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Colores por categoría");

    panel.innerHTML = `
        <header>
            <strong>Colores por categoría</strong>
            <button type="button" class="cal-quick-close" data-colors-close
                aria-label="Cerrar">×</button>
        </header>

        <p class="cal-colors-hint">
            Elegí un color para cada tipo de evento. Se guarda en este navegador.
        </p>

        <div class="cal-colors-list">
            ${Object.entries(CATEGORIES).map(([value, label]) => `
                <div class="cal-colors-row">
                    <span class="cal-event-chip category-${value} cal-colors-sample">
                        ${escapeHTML(label)}
                    </span>

                    <div class="cal-colors-swatches">
                        ${COLOR_SWATCHES.map(color => `
                            <button type="button"
                                class="cal-swatch ${colors[value] === color ? "selected" : ""}"
                                style="background:${color}"
                                data-color-category="${value}"
                                data-color="${color}"
                                aria-label="Usar este color para ${escapeHTML(label)}"></button>
                        `).join("")}

                        <label class="cal-swatch cal-swatch-custom"
                            title="Elegir otro color">
                            <input type="color" value="${colors[value]}"
                                data-color-input="${value}"
                                aria-label="Otro color para ${escapeHTML(label)}">
                        </label>
                    </div>
                </div>
            `).join("")}
        </div>

        <footer>
            <button type="button" class="cal-colors-reset" data-colors-reset>
                Restablecer colores
            </button>
        </footer>
    `;

    (root || document.body).appendChild(panel);

    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    panel.style.left = `${Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)}px`;
    panel.style.top = `${rect.top - height - 10 > 12 ? rect.top - height - 10 : Math.min(rect.bottom + 10, window.innerHeight - height - 12)}px`;

    function setColor(category, color) {
        saveCategoryColor(category, color);
        applyCategoryColors();

        panel.querySelectorAll(`[data-color-category="${category}"]`)
            .forEach(button =>
                button.classList.toggle("selected", button.dataset.color === color)
            );

        const input = panel.querySelector(`[data-color-input="${category}"]`);
        if (input && color) input.value = color;
    }

    panel.addEventListener("click", event => {

        if (event.target.closest("[data-colors-close]")) {
            closeColorsPanel();
            return;
        }

        const swatch = event.target.closest("[data-color-category]");

        if (swatch) {
            setColor(swatch.dataset.colorCategory, swatch.dataset.color);
            return;
        }

        if (event.target.closest("[data-colors-reset]")) {
            try { localStorage.removeItem(CATEGORY_COLORS_KEY); } catch {}
            applyCategoryColors();
            closeColorsPanel();
            openColorsPanel(anchor);
        }
    });

    panel.addEventListener("input", event => {
        const input = event.target.closest("[data-color-input]");
        if (input) setColor(input.dataset.colorInput, input.value);
    });

    const onOutside = event => {
        if (!panel.contains(event.target) &&
            !event.target.closest("[data-edit-colors]")) {
            closeColorsPanel();
        }
    };

    const onKey = event => {
        if (event.key === "Escape") closeColorsPanel();
    };

    setTimeout(() => {
        if (!panel.isConnected) return;
        document.addEventListener("click", onOutside, true);
        document.addEventListener("keydown", onKey);
    }, 150);

    panel._cleanup = () => {
        document.removeEventListener("click", onOutside, true);
        document.removeEventListener("keydown", onKey);
    };
}


function showToast(message, type = "success", actions = []) {

    const config = typeof message === "object" && message !== null
        ? message
        : { message, type, actions };

    const kind = config.type || "success";

    const titles = {
        success: "Evento guardado",
        deleted: "Evento eliminado",
        error: "No se pudo completar la operación",
        info: "Información"
    };

    const icons = {
        success: "✓",
        deleted: "▤",
        error: "!",
        info: "i"
    };

    let container = document.querySelector(".cal-toast-container");

if (!container) {
    container = document.createElement("div");
    container.className = "cal-toast-container";
    document.body.appendChild(container);
}

    const toast = document.createElement("div");
    toast.className = `cal-toast cal-toast-${kind}`;
    toast.setAttribute(
        "role",
        kind === "error" ? "alert" : "status"
    );

    // Encabezado
    const header = document.createElement("div");
    header.className = "cal-toast-header";

    const icon = document.createElement("span");
    icon.className = "cal-toast-icon";
    icon.textContent = icons[kind] || "i";

    const content = document.createElement("div");
    content.className = "cal-toast-content";

    const title = document.createElement("strong");
    title.textContent = config.title || titles[kind];

    const description = document.createElement("p");
    description.textContent = config.message || "";

    content.append(title, description);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "cal-toast-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Cerrar notificación");

    header.append(icon, content, close);
    toast.appendChild(header);

    // Acciones opcionales
    if (config.actions?.length) {
        const actionsContainer = document.createElement("div");
        actionsContainer.className = "cal-toast-actions";

        config.actions.forEach(action => {
            if (typeof action.onClick !== "function") return;

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = action.label;

            button.className = action.primary
                ? "cal-toast-action-primary"
                : "cal-toast-action-secondary";

            button.addEventListener("click", async () => {
                button.disabled = true;

                try {
                    await action.onClick();
                    closeToast();
                } catch (error) {
                    console.error("Error en acción:", error);
                    button.disabled = false;
                }
            });

            actionsContainer.appendChild(button);
        });

        if (actionsContainer.children.length) {
            toast.appendChild(actionsContainer);
        }
    }

    // Barra de duración
    const duration = config.duration ??
        (kind === "error" ? 0 : 6000);

    if (duration > 0) {
        const progress = document.createElement("div");
        progress.className = "cal-toast-progress";
        progress.style.animationDuration = `${duration}ms`;
        toast.appendChild(progress);
    }

    container.appendChild(toast);

    let timer;

    function closeToast() {
        clearTimeout(timer);
        toast.classList.remove("is-visible");

        window.setTimeout(() => {
            toast.remove();

            if (!container.children.length) {
                container.remove();
            }
        }, 250);
    }

    close.addEventListener("click", closeToast);

    requestAnimationFrame(() => {
        toast.classList.add("is-visible");
    });

    if (duration > 0) {
        timer = window.setTimeout(closeToast, duration);
    }
}


/* MENSAJES DE ERROR GENERALES */

function getFriendlyErrorMessage(error) {

    const message = String(error?.message || "").toLowerCase();

    if (
        /network|fetch|connection|timeout|offline|load failed/.test(message)
    ) {
        return "No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.";
    }

    if (
        /permission|row.level security|unauthorized|not authorized|jwt/.test(message)
    ) {
        return "No tenés permisos para realizar esta acción.";
    }

    return error?.message ||
        "Ocurrió un problema inesperado. Intentá nuevamente.";
}



    /* ======================================
       PERMISOS
    ====================================== */

    function canManage() {
        return ["admin_gerencia", "mkt", "brands"].includes(role);
    }

    function canDeleteEvents() {
        return role === "admin_gerencia";
    }

    function canManageAttachments() {
        return canManage();
    }


    /* ======================================
       UTILIDADES
    ====================================== */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function safeURL(value) {
        try {
            const url = new URL(value);

            return ["http:", "https:"].includes(url.protocol)
                ? url.href
                : "";
        } catch {
            return "";
        }
    }

    function localDateKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function dateFromISO(value) {
        const date = new Date(value);

        return new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );
    }

    function inputDate(value) {
        return localDateKey(dateFromISO(value));
    }

    // Calcula la diferencia entre dos fechas.
function calendarDayOffset(fromDate, toDate) {
    const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
    const [toYear, toMonth, toDay] = toDate.split("-").map(Number);

    const fromUTC = Date.UTC(fromYear, fromMonth - 1, fromDay);
    const toUTC = Date.UTC(toYear, toMonth - 1, toDay);

    return Math.round((toUTC - fromUTC) / 86400000);
}

// Desplaza una fecha conservando el formato YYYY-MM-DD.
function shiftCalendarDate(dateKey, days) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    date.setDate(date.getDate() + days);

    return localDateKey(date);
}


    function dateToISO(value, endOfDay = false) {
        const time = endOfDay ? "23:59:59" : "00:00:00";

        return new Date(`${value}T${time}`).toISOString();
    }

    function formatDate(value) {
        if (!value) return "Sin fecha";

        return new Intl.DateTimeFormat("es-PY", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(new Date(value));
    }

    function categoryName(category) {
        return CATEGORIES[category] || category;
    }

    function statusName(status) {
        return STATUSES[status] || status;
    }

    function getEventEnd(event) {
        return event.end_at || event.start_at;
    }

    function eventOverlaps(event, from, to) {
        const start = localDateKey(dateFromISO(event.start_at));
        const end = localDateKey(dateFromISO(getEventEnd(event)));

        return start <= localDateKey(to) &&
               end >= localDateKey(from);
    }

    function getEventsForMonth(date) {
        const from = new Date(
            date.getFullYear(),
            date.getMonth(),
            1
        );

        const to = new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            0
        );

        return getFilteredEvents().filter(event =>
            eventOverlaps(event, from, to)
        );
    }


    /* ======================================
       INICIALIZACIÓN
    ====================================== */

    async function initializeCalendar(view) {
        const calendar = view.querySelector("#fenixCalendar");

        if (!calendar) return;

        root = calendar;

        if (!initialized) {
            initialized = true;
            attachListeners();
        }

        await loadData();
    }


    /* ======================================
       CARGAR CATÁLOGOS Y EVENTOS
    ====================================== */

    async function loadCatalogs() {
        const [brandResult, branchResult, responsibleResult] =
            await Promise.all([
                supabase
                    .from("calendar_brands")
                    .select("id,name")
                    .eq("active", true)
                    .order("name"),

                supabase
                    .from("calendar_branches")
                    .select("id,name")
                    .eq("active", true)
                    .order("name"),

                supabase.rpc("calendar_responsibles")
            ]);

        if (brandResult.error) throw brandResult.error;
        if (branchResult.error) throw branchResult.error;
        if (responsibleResult.error) throw responsibleResult.error;

        brands = brandResult.data || [];
        branches = branchResult.data || [];
        responsibles = responsibleResult.data || [];

        populateCatalogOptions();
    }

    function populateCatalogOptions() {

        /* Filtro de marcas */

        const brandDropdown =
            $('[data-brand-option]')?.closest(".cal-dropdown");

        if (brandDropdown) {
            brandDropdown.innerHTML = `
                <label>
                    <input type="checkbox"
                        value="all"
                        data-brand-option checked>
                    Todas
                </label>

                ${brands.map(brand => `
                    <label>
                        <input type="checkbox"
                            value="${escapeHTML(brand.id)}"
                            data-brand-option>
                        ${escapeHTML(brand.name)}
                    </label>
                `).join("")}
            `;
        }

        /* Marcas del formulario */

        const eventBrands = $("#calEventBrands");

        if (eventBrands) {
            eventBrands.innerHTML = brands.map(brand => `
                <label>
                    <input type="checkbox"
                        value="${escapeHTML(brand.id)}">
                    ${escapeHTML(brand.name)}
                </label>
            `).join("");
        }

        /* Filtro de sucursales */

        const branchOptions = $("#calBranchOptions");

        if (branchOptions) {
            branchOptions.innerHTML = branches.map(branch => `
                <label>
                    <input type="checkbox"
                        value="${escapeHTML(branch.id)}"
                        data-branch-option>
                    ${escapeHTML(branch.name)}
                </label>
            `).join("");
        }

        /* Sucursales del formulario */

        const eventBranches = $("#calEventBranches");

        if (eventBranches) {
            eventBranches.innerHTML = branches.map(branch => `
                <label>
                    <input type="checkbox"
                        value="${escapeHTML(branch.id)}">
                    ${escapeHTML(branch.name)}
                </label>
            `).join("");
        }

        /* Responsables */

        const filterResponsible = $("#calFilterResponsible");
        const eventResponsible = $("#calEventResponsible");

        filterResponsible.innerHTML = `
            <option value="all">Todos</option>
            <option value="not_applicable">No aplica</option>
            ${responsibles.map(person => `
                <option value="${escapeHTML(person.user_id)}">
                    ${escapeHTML(person.display_name)}
                </option>
            `).join("")}
        `;

        eventResponsible.innerHTML = `
            <option value="not_applicable">No aplica</option>
            ${responsibles.map(person => `
                <option value="${escapeHTML(person.user_id)}">
                    ${escapeHTML(person.display_name)}
                </option>
            `).join("")}
        `;

        updateFilterLabels();
    }


    async function loadEvents() {

        const { data: eventRows, error } = await supabase
            .from("calendar_events")
            .select("*")
            .neq("category", "reunion")
            .order("start_at", { ascending: true })
            .limit(1000);

        if (error) throw error;

        const rows = eventRows || [];

        if (!rows.length) {
            events = [];
            return;
        }

        const ids = rows.map(event => event.id);

        const [
            brandLinks,
            branchLinks,
            attachments
        ] = await Promise.all([

            supabase
                .from("calendar_event_brands")
                .select("event_id,brand_id,calendar_brands(id,name)")
                .in("event_id", ids),

            supabase
                .from("calendar_event_branches")
                .select("event_id,branch_id,calendar_branches(id,name)")
                .in("event_id", ids),

            supabase
                .from("calendar_event_attachments")
                .select("*")
                .in("event_id", ids)
        ]);

        if (brandLinks.error) throw brandLinks.error;
        if (branchLinks.error) throw branchLinks.error;
        if (attachments.error) throw attachments.error;

        const brandMap = new Map(
            brands.map(item => [item.id, item])
        );

        const branchMap = new Map(
            branches.map(item => [item.id, item])
        );

        events = rows.map(event => {

            const eventBrands = brandLinks.data
                .filter(link => link.event_id === event.id)
                .map(link =>
                    link.calendar_brands || brandMap.get(link.brand_id)
                )
                .filter(Boolean);

            const eventBranches = branchLinks.data
                .filter(link => link.event_id === event.id)
                .map(link =>
                    link.calendar_branches || branchMap.get(link.branch_id)
                )
                .filter(Boolean);

            const eventAttachments = attachments.data
                .filter(item => item.event_id === event.id);

            const responsible = responsibles.find(
                person => person.user_id === event.responsible_user_id
            );

            return {
                ...event,
                brands: eventBrands,
                branches: eventBranches,
                attachments: eventAttachments,
                responsible_name:
                    responsible?.display_name || "No aplica"
            };
        });
    }



async function loadNotifications() {
    const badge = $("#calNotificationCount");
    const list = $("#calNotificationsList");

    if (!badge || !list || !supabase || !user) return;

    try {
        const { data, error } = await supabase
            .from("calendar_event_notifications")
            .select("id,event_id,notification_type,due_at,created_at,seen_at")
            .is("resolved_at", null)
            .order("created_at", { ascending: false });

        if (error) throw error;

        eventNotifications = data || [];

        // Contar solamente las notificaciones no leídas.
        const unreadCount = eventNotifications.filter(
            notification => !notification.seen_at
        ).length;

        badge.textContent = String(unreadCount);
        badge.hidden = unreadCount === 0;

        if (!eventNotifications.length) {
            list.innerHTML = `
                <p class="cal-empty-text">
                    No tenés notificaciones pendientes.
                </p>
            `;
            return;
        }

        
list.innerHTML = eventNotifications.map(notification => {
    const event = events.find(
        item => item.id === notification.event_id
    );

    return `
        <div class="cal-notification-item ${notification.seen_at ? "is-read" : ""}">

            <button
                type="button"
                class="cal-notification-open"
                data-notification-event="${escapeHTML(notification.event_id)}"
                data-notification-id="${notification.id}">

                <strong>
                    ${escapeHTML(event?.title || "Evento")}
                </strong>

                <span>
                    La fecha de finalización llegó.
                    Confirmá el estado del evento.
                </span>

                <small>
                    ${notification.seen_at ? "Leída" : "Sin leer"}
                    · ${formatDate(notification.due_at)}
                </small>
            </button>

            <div class="cal-notification-actions">
                <button
                    type="button"
                    data-notification-complete="${notification.id}"
                    ${!event ? "disabled" : ""}>
                    Marcar como completado
                </button>

                <button
                    type="button"
                    data-notification-edit="${notification.id}"
                    ${!event ? "disabled" : ""}>
                    Modificar fecha / estado
                </button>
            </div>

        </div>
    `;
}).join("");


    } catch (error) {
        console.error("Error al cargar notificaciones:", error);

        list.innerHTML = `
            <p class="cal-empty-text">
                No se pudieron cargar las notificaciones.
            </p>
        `;
    }
}



    async function loadData() {
        if (loading) return;

        loading = true;

        try {
            await window.FENIX_AUTH_READY;

            supabase = window.fenixSupabase;
            user = window.FENIX_USER;
            role = user?.role || "";

            if (!supabase || !user) {
                throw new Error("No se encontró una sesión válida.");
            }

            await loadCatalogs();
            await loadEvents();
            await loadNotifications();

            applyPermissions();
            renderAll();

        } catch (error) {
            console.error("Error al cargar el calendario:", error);

            $("#calendarGrid").innerHTML = `
                <div class="cal-empty">
                    No se pudieron cargar los eventos.
                    Revisá tu conexión e intentá nuevamente.
                </div>
            `;

        } finally {
            loading = false;
        }
    }


    /* ======================================
       PERMISOS VISUALES
    ====================================== */

    function applyPermissions() {

    const newButton = $("#calNewEvent");
    const importButton = $("#calImportExcel");

    if (newButton) {
        newButton.hidden = !canManage();
    }

    if (importButton) {
        importButton.hidden = !canManage();
    }
}


    /* ======================================
       FILTROS
    ====================================== */

    function readMultiFilter(attribute) {
        const boxes = $$(`[${attribute}]`);

        const allOption = boxes.find(box => box.value === "all");

        if (!allOption || allOption.checked) return null;

        return boxes
            .filter(box => box.checked && box.value !== "all")
            .map(box => box.value);
    }


    function updateFilterLabels() {

        const selectedBrands = readMultiFilter("data-brand-option");
        const selectedBranches = readMultiFilter("data-branch-option");

        $("#calBrandLabel").textContent =
            selectedBrands === null
                ? "Todas"
                : selectedBrands.length + " seleccionadas";

        $("#calBranchLabel").textContent =
            selectedBranches === null
                ? "Todas"
                : selectedBranches.length + " seleccionadas";

        const categories = readMultiFilter("data-category-option");

        $("#calCategoryLabel").textContent =
            categories === null
                ? "Todas"
                : categories.length + " seleccionadas";
    }


    function handleMultiFilter(event, attribute) {
        const input = event.target;

        if (!input.matches(`[${attribute}]`)) return;

        const boxes = $$(`[${attribute}]`);

        const allOption = boxes.find(box => box.value === "all");

        if (input.value === "all" && input.checked) {
            boxes.forEach(box => {
                if (box !== input) box.checked = false;
            });

        } else {
            if (allOption) allOption.checked = false;

            const selected = boxes.filter(box =>
                box.checked && box.value !== "all"
            );

            if (!selected.length && allOption) {
                allOption.checked = true;
            }
        }

        updateFilterLabels();
        renderAll();
    }


    function getFilteredEvents() {

        const selectedBrands = readMultiFilter("data-brand-option");
        const selectedCategories = readMultiFilter("data-category-option");
        const selectedBranches = readMultiFilter("data-branch-option");

        const responsible = $("#calFilterResponsible").value;

        return events.filter(event => {

            /* Marcas */

            if (selectedBrands !== null &&
                selectedBrands.length &&
                event.brand_scope !== "all") {

                const matches = event.brands.some(brand =>
                    selectedBrands.includes(brand.id)
                );

                if (!matches) return false;
            }

            /* Categorías */

            if (selectedCategories !== null &&
                selectedCategories.length &&
                !selectedCategories.includes(event.category)) {
                return false;
            }

            /* Sucursales */

            if (selectedBranches !== null &&
                selectedBranches.length) {

                if (event.branch_scope === "not_applicable") {
                    if (!selectedBranches.includes("not_applicable")) {
                        return false;
                    }

                } else if (event.branch_scope !== "all") {

                    const matches = event.branches.some(branch =>
                        selectedBranches.includes(branch.id)
                    );

                    if (!matches) return false;
                }
            }

            /* Responsable */

            if (responsible !== "all") {

                if (responsible === "not_applicable") {
                    if (event.responsible_mode !== "not_applicable") {
                        return false;
                    }

                } else if (event.responsible_user_id !== responsible) {
                    return false;
                }
            }

            return true;
        });
    }


    function clearFilters() {
        $$("[data-brand-option], [data-category-option], [data-branch-option]")
            .forEach(box => {
                box.checked = box.value === "all";
            });

        $("#calFilterResponsible").value = "all";

        updateFilterLabels();
        renderAll();
    }


    /* ======================================
       RENDERIZADO GENERAL
    ====================================== */

   function renderAll() {
    applyCategoryColors();
    renderLegend();
    renderCalendar();
    renderStats();
    renderUpcoming();
}


    function renderStats() {

        const monthEvents = getEventsForMonth(currentDate);

        const activeCampaigns = monthEvents.filter(event =>
            event.category === "campana" &&
            ["planificado", "en_progreso"].includes(event.status)
        );

        const launches = monthEvents.filter(event =>
            event.category === "lanzamiento"
        );

        const branchEvents = monthEvents.filter(event =>
            ["feria", "sucursal"].includes(event.category)
        );

        $("#calStatEvents").textContent = monthEvents.length;
        $("#calStatCampaigns").textContent = activeCampaigns.length;
        $("#calStatLaunches").textContent = launches.length;
        $("#calStatBranches").textContent = branchEvents.length;
    }


    /* ======================================
       CALENDARIO MES / SEMANA
    ====================================== */

    function startOfWeek(date) {
        const result = new Date(date);
        const day = (result.getDay() + 6) % 7;

        result.setDate(result.getDate() - day);
        result.setHours(0, 0, 0, 0);

        return result;
    }


    function renderCalendar() {

        const grid = $("#calendarGrid");
        const weekdays = $(".cal-weekdays");

        const monthName = new Intl.DateTimeFormat("es-PY", {
            month: "long",
            year: "numeric"
        }).format(currentDate);

        $("#calCurrentMonth").textContent =
            monthName.charAt(0).toUpperCase() + monthName.slice(1);

        const filteredEvents = getFilteredEvents();

        if (currentView === "agenda" || currentView === "list") {
            renderListView(filteredEvents);
            return;
        }

        weekdays.hidden = false;
        grid.className = "cal-grid";
        grid.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";

        let firstDay;
        let totalDays;

        if (currentView === "week") {
            firstDay = startOfWeek(selectedDate);
            totalDays = 7;

            const lastDay = new Date(firstDay);
            lastDay.setDate(lastDay.getDate() + 6);

            $("#calCurrentMonth").textContent =
                `${formatDate(firstDay)} – ${formatDate(lastDay)}`;

        } else {

            const monthStart = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                1
            );

            const offset = (monthStart.getDay() + 6) % 7;

            firstDay = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                1 - offset
            );

            const daysInMonth = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + 1,
                0
            ).getDate();

            totalDays = Math.ceil((offset + daysInMonth) / 7) * 7;
        }

        const todayKey = localDateKey(new Date());
        const selectedKey = localDateKey(selectedDate);

        // Asignar a cada evento una "fila" (carril) por semana, para que
        // los eventos de varios días se vean como una barra continua
        // y a la misma altura en todos los días.
        const MAX_LANES = 4;
        const laneMap = new Map();

        const eventKeys = event => {
            const start = inputDate(event.start_at);
            const end = event.end_at ? inputDate(event.end_at) : start;
            return { start, end: end < start ? start : end };
        };

        for (let w = 0; w < totalDays / 7; w++) {

            const weekStart = new Date(firstDay);
            weekStart.setDate(firstDay.getDate() + w * 7);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const weekStartKey = localDateKey(weekStart);
            const weekEndKey = localDateKey(weekEnd);

            const lanes = [];

            filteredEvents
                .filter(event => eventOverlaps(event, weekStart, weekEnd))
                .map(event => ({ event, ...eventKeys(event) }))
                .sort((a, b) =>
                    a.start.localeCompare(b.start) ||
                    b.end.localeCompare(a.end) ||
                    String(a.event.title).localeCompare(String(b.event.title))
                )
                .forEach(({ event, start, end }) => {

                    const from = start < weekStartKey ? weekStartKey : start;
                    const to = end > weekEndKey ? weekEndKey : end;

                    let lane = 0;

                    while (
                        lanes[lane] &&
                        lanes[lane].some(range => !(to < range.from || from > range.to))
                    ) {
                        lane++;
                    }

                    (lanes[lane] ||= []).push({ from, to });
                    laneMap.set(`${w}|${event.id}`, lane);
                });
        }

        let html = "";

        for (let i = 0; i < totalDays; i++) {

            const day = new Date(firstDay);
            day.setDate(firstDay.getDate() + i);

            const dayKey = localDateKey(day);

            const outside =
                day.getMonth() !== currentDate.getMonth() &&
                currentView === "month";

            const week = Math.floor(i / 7);
            const weekday = i % 7;

            const dayEvents = filteredEvents
                .filter(event => eventOverlaps(event, day, day))
                .map(event => ({
                    event,
                    lane: laneMap.get(`${week}|${event.id}`) ?? 99
                }))
                .sort((a, b) => a.lane - b.lane);

            const visible = dayEvents.filter(item => item.lane < MAX_LANES);
            const hiddenCount = dayEvents.length - visible.length;

            const usedLanes = visible.length
                ? Math.max(...visible.map(item => item.lane)) + 1
                : 0;

            let eventChips = "";

            for (let lane = 0; lane < usedLanes; lane++) {

                const item = visible.find(entry => entry.lane === lane);

                // Espacio vacío para mantener alineadas las barras.
                if (!item) {
                    eventChips += `<span class="cal-event-spacer" aria-hidden="true"></span>`;
                    continue;
                }

                const { event } = item;
                const { start: startDate, end: endDate } = eventKeys(event);

                const isStartDay = dayKey === startDate;
                const isEndDay = dayKey === endDate;

                const resizeHandles = canManage()
                    ? `${isStartDay && startDate !== endDate
                            ? `<span class="cal-resize-handle edge-start" data-edge="start"
                                title="Arrastrá para cambiar el inicio"></span>`
                            : ""}${isEndDay
                            ? `<span class="cal-resize-handle edge-end" data-edge="end"
                                title="Arrastrá para cambiar la finalización"></span>`
                            : ""}`
                    : "";

                const continuesLeft = dayKey !== startDate && weekday !== 0;
                const continuesRight = dayKey !== endDate && weekday !== 6;

                // El nombre se muestra al inicio del evento
                // o al comienzo de cada semana.
                const showTitle = !continuesLeft;

                // Cantidad de días que ocupa la barra en esta semana,
                // para que el nombre se lea a lo largo de toda la barra.
                const spanDays = Math.min(
                    6 - weekday,
                    Math.max(0, calendarDayOffset(dayKey, endDate))
                ) + 1;

                eventChips += `
                    <button type="button"
                        class="cal-event-chip category-${escapeHTML(event.category)}
                            ${startDate !== endDate ? "is-multi" : ""}
                            ${continuesLeft ? "continues-left" : ""}
                            ${continuesRight ? "continues-right" : ""}"
                        draggable="false"
                        data-event-id="${escapeHTML(event.id)}"
                        data-event-date="${dayKey}"
                        title="${escapeHTML(event.title)}"
                        aria-label="${escapeHTML(event.title)}">
                        ${showTitle
                            ? `<span class="cal-event-label" style="--span:${spanDays}">${escapeHTML(event.title)}</span>`
                            : "&nbsp;"}${resizeHandles}
                    </button>
                `;
            }

            const more = hiddenCount > 0
                ? `<button type="button" class="cal-more-events"
                        data-more-date="${dayKey}"
                        aria-label="Ver los ${dayEvents.length} eventos del día">
                        +${hiddenCount} más
                   </button>`
                : "";

            html += `
                <div class="cal-day
                    ${dayKey === todayKey ? "is-today" : ""}
                    ${outside ? "is-outside" : ""}
                    ${dayKey === selectedKey ? "is-selected" : ""}"
                    data-date="${dayKey}">

                    <span class="cal-day-number">${day.getDate()}</span>

                    ${eventChips}
                    ${more}
                </div>
            `;
        }

        grid.innerHTML = html;
    }

    /* ======================================
   ARRASTRAR EVENTOS ENTRE DÍAS
====================================== */

// mode: "move"  = mover el evento completo (mantiene la duración)
//       "start" = cambiar solo la fecha de inicio (tirador izquierdo)
//       "end"   = cambiar solo la fecha de finalización (tirador derecho)
async function moveCalendarEvent(eventId, sourceDate, targetDate, mode = "move") {
    if (!canManage()) return;

    const calendarEvent = events.find(item => item.id === eventId);

    if (!calendarEvent) {
        showToast("No se encontró el evento.", "error");
        return;
    }

    const oldStartDate = inputDate(calendarEvent.start_at);
    const oldEndDate = calendarEvent.end_at
        ? inputDate(calendarEvent.end_at)
        : oldStartDate;

    const isSingleDay = oldStartDate === oldEndDate;

    let newStartDate = oldStartDate;
    let newEndDate = oldEndDate;

    if (mode === "set") {
        // Desde la ventanita: sourceDate = nuevo inicio, targetDate = nuevo fin.
        newStartDate = sourceDate;
        newEndDate = targetDate;
    } else if (mode === "start") {
        newStartDate = targetDate;
    } else if (mode === "end") {
        newEndDate = targetDate;
    } else {
        // Mover todo el evento la misma cantidad de días.
        const delta = calendarDayOffset(sourceDate, targetDate);
        newStartDate = shiftCalendarDate(oldStartDate, delta);
        newEndDate = shiftCalendarDate(oldEndDate, delta);
    }

    if (newStartDate > newEndDate) {
        showToast(
            mode === "start"
                ? "El inicio no puede quedar después de la finalización."
                : "La finalización no puede quedar antes del inicio.",
            "error"
        );
        return;
    }

    if (newStartDate === oldStartDate && newEndDate === oldEndDate) {
        return;
    }

    const changes = {
        updated_by: user.id
    };

    if (newStartDate !== oldStartDate) {
        changes.start_at = dateToISO(newStartDate);
    }

    // Guardar la finalización si cambió (también en eventos
    // de un día que se estiran a varios días).
    if (newEndDate !== oldEndDate) {
        changes.end_at = dateToISO(newEndDate, true);
    } else if (calendarEvent.end_at && changes.start_at && isSingleDay) {
        changes.end_at = dateToISO(newEndDate, true);
    }

    const detailModal = $("#calEventDetailModal");
    const refreshOpenDetail =
        selectedEventId === eventId &&
        detailModal &&
        !detailModal.hidden;

    try {
        const { data, error } = await supabase
            .from("calendar_events")
            .update(changes)
            .eq("id", eventId)
            .select("id,start_at,end_at")
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            throw new Error(
                "No se pudo actualizar el evento. Verificá los permisos en Supabase."
            );
        }

        Object.assign(calendarEvent, {
            start_at: data.start_at,
            end_at: data.end_at
        });

        renderAll();

        if (refreshOpenDetail) {
            await renderDetail(eventId);
        }

        showToast({
            type: "success",
            title: "Fecha actualizada",
            message: `Se actualizaron las fechas de "${calendarEvent.title}".`
        });

    } catch (error) {
        console.error("Error al mover el evento:", error);

        try {
            await loadEvents();
            renderAll();

            if (refreshOpenDetail) {
                await renderDetail(eventId);
            }
        } catch (reloadError) {
            console.error("Error al restaurar el calendario:", reloadError);
        }

        showToast(getFriendlyErrorMessage(error), "error");
    }
}

    /* ======================================
       AGENDA / LISTADO
    ====================================== */

    function renderListView(filteredEvents) {

        const grid = $("#calendarGrid");

        $(".cal-weekdays").hidden = true;

        grid.className = currentView === "agenda"
            ? "cal-agenda-list"
            : "cal-list-view";

        grid.style.gridTemplateColumns = "1fr";

        const monthEvents = getEventsForMonth(currentDate)
            .filter(event => filteredEvents.some(
                item => item.id === event.id
            ));

        if (!monthEvents.length) {
            grid.innerHTML = `
                <div class="cal-empty">
                    No hay eventos para este período.
                </div>
            `;
            return;
        }

        grid.innerHTML = monthEvents.map(event => {

           const branchesLabel = event.branch_scope === "not_applicable"
    ? "No corresponde"
    : event.branch_scope === "all"
        ? "Todas las sucursales"
        : event.branches.map(item => item.name).join(", ");

            return `
                <button type="button"
                    class="${currentView === "agenda"
                        ? "cal-agenda-item"
                        : "cal-list-item"}"
                    data-event-id="${escapeHTML(event.id)}">

                    <strong>${escapeHTML(event.title)}</strong>

                    <span>
                        ${formatDate(event.start_at)}
                        ${event.end_at
                            ? " – " + formatDate(event.end_at)
                            : ""}
                    </span>

                    <span>
                        ${escapeHTML(categoryName(event.category))}
                        · ${escapeHTML(branchesLabel)}
                    </span>

                    <span>
                        ${escapeHTML(statusName(event.status))}
                    </span>
                </button>
            `;
        }).join("");
    }


    /* ======================================
       PRÓXIMOS EVENTOS
    ====================================== */

    function renderUpcoming() {

        const todayKey = localDateKey(new Date());

        const upcoming = getFilteredEvents()
            .filter(event => {
                const endKey = localDateKey(
                    dateFromISO(getEventEnd(event))
                );

                return endKey >= todayKey &&
                    !["cancelado", "completado"].includes(event.status);
            })
            .sort((a, b) =>
                new Date(a.start_at) - new Date(b.start_at)
            )
            .slice(0, 5);

        const container = $("#calUpcomingEvents");

        if (!upcoming.length) {
            container.innerHTML = `
                <p class="cal-empty-text">
                    No hay próximos eventos.
                </p>
            `;
            return;
        }

        container.innerHTML = upcoming.map(event => {
            const date = new Date(event.start_at);

            return `
                <div class="cal-upcoming-item"
                    data-event-id="${escapeHTML(event.id)}">

                    <div class="cal-upcoming-date">
                        ${date.toLocaleDateString("es-PY", {
                            month: "short"
                        }).toUpperCase()}
                        <br>
                        ${date.getDate()}
                    </div>

                    <div class="cal-upcoming-info">
                        <strong>${escapeHTML(event.title)}</strong>
                        <span>
                            ${escapeHTML(categoryName(event.category))}
                            · ${escapeHTML(
                                event.branch_scope === "not_applicable"
                                    ? "Sin sucursal"
                                    : event.branch_scope === "all"
                                        ? "Todas las sucursales"
                                        : event.branches.map(b => b.name).join(", ")
                            )}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }


    /* ======================================
       DETALLE DEL EVENTO
    ====================================== */

    async function renderDetail(id) {

        const event = events.find(item => item.id === id);

const container = $("#calEventDetailModalBody");

        if (!event) {
            container.innerHTML = `
                <p class="cal-empty-text">
                    Seleccioná un evento del calendario.
                </p>
            `;
            return;
        }

        const brandsLabel = event.brand_scope === "all"
            ? "Todas las marcas"
            : event.brands.map(item => item.name).join(", ");

        const branchesLabel = event.branch_scope === "not_applicable"
            ? "No corresponde"
            : event.branch_scope === "all"
                ? "Todas las sucursales"
                : event.branches.map(item => item.name).join(", ");
const areaLabels = {
    marketing: "Marketing",
    brands: "Brands",
    retail: "Retail",
    mayorista: "Mayorista",
    otros: "Otros",
    not_applicable: "No aplica"
};

const areaLabel = areaLabels[event.area] || "No corresponde";

        const locationLink = safeURL(event.location_url);
        const eventLink = safeURL(event.event_url);

        let imageHTML = "";

        for (const attachment of event.attachments) {

            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(attachment.storage_path, 3600);

            if (error || !data?.signedUrl) continue;

           imageHTML += `
    <div class="cal-attachment">

        <div class="cal-image-frame is-loading">
            <img class="cal-detail-image"
                src="${escapeHTML(data.signedUrl)}"
                alt="${escapeHTML(attachment.file_name)}">
        </div>

        ${canManageAttachments() ? `
            <button type="button"
                data-delete-attachment="${escapeHTML(attachment.id)}">
                Eliminar imagen
            </button>
        ` : ""}

    </div>
`;

            
        }

        container.innerHTML = `
            <div class="cal-detail-content">

                <h4>${escapeHTML(event.title)}</h4>

                <span>
                    ${escapeHTML(categoryName(event.category))}
                    · ${escapeHTML(statusName(event.status))}
                </span>

                ${event.description ? `
                    <p>${escapeHTML(event.description)}</p>
                ` : ""}

                ${event.launch_name ? `
                    <p><strong>Lanzamiento:</strong>
                    ${escapeHTML(event.launch_name)}</p>
                ` : ""}

                <p><strong>Marcas:</strong> ${escapeHTML(brandsLabel)}</p>

                <p><strong>Sucursales:</strong>
                    ${escapeHTML(branchesLabel)}
                </p>

                <p><strong>Responsable:</strong>
                    ${escapeHTML(event.responsible_name)}
                </p>

<p><strong>Área:</strong>
    ${escapeHTML(areaLabel)}
</p>
                <p><strong>Inicio:</strong> ${formatDate(event.start_at)}</p>

                <p><strong>Finalización:</strong>
                    ${event.end_at
                        ? formatDate(event.end_at)
                        : "No indicada"}
                </p>

                ${event.location_name ? `
                    <p><strong>Ubicación:</strong>
                    ${escapeHTML(event.location_name)}</p>
                ` : ""}

                ${locationLink ? `
                    <a href="${escapeHTML(locationLink)}"
                        target="_blank" rel="noopener noreferrer">
                        Ver ubicación en Maps ↗
                    </a>
                ` : ""}

                ${eventLink ? `
                    <a href="${escapeHTML(eventLink)}"
                        target="_blank" rel="noopener noreferrer">
                        Abrir enlace del evento ↗
                    </a>
                ` : ""}

                ${imageHTML ? `
                    <div class="cal-detail-images">
                        ${imageHTML}
                    </div>
                ` : ""}

                <div class="cal-detail-actions">

                    ${canManage() ? `
                        <button type="button"
                            class="cal-secondary-btn"
                            data-edit-event="${escapeHTML(event.id)}">
                            Editar evento
                        </button>
                    ` : ""}

                    ${canDeleteEvents() ? `
                        <button type="button"
                            class="cal-delete-btn"
                            data-delete-event="${escapeHTML(event.id)}">
                            Eliminar evento
                        </button>
                    ` : ""}

                </div>

            </div>
        `;

// Actualizar también el detalle lateral
const sideContainer = $("#calEventDetail");

if (sideContainer) {
    sideContainer.innerHTML = container.innerHTML;
}

// Detectar las imágenes de la ventana y del panel lateral
[container, sideContainer].filter(Boolean).forEach(detailContainer => {

    detailContainer.querySelectorAll(".cal-image-frame").forEach(frame => {

        const img = frame.querySelector(".cal-detail-image");

        if (!img) {
            frame.classList.add("is-error");
            return;
        }

        // Imagen cargada
        const finishLoading = () => {
            frame.classList.remove("is-loading");
            frame.classList.add("is-loaded");
        };

        // Imagen con error
        const failLoading = () => {
            frame.classList.remove("is-loading");
            frame.classList.add("is-error");
        };

        // Detectar si ya terminó de cargar
        if (img.complete) {

            if (img.naturalWidth > 0) {
                finishLoading();
            } else {
                failLoading();
            }

            return;
        }

        // Esperar la carga
        img.addEventListener("load", finishLoading, { once: true });
        img.addEventListener("error", failLoading, { once: true });

    });

});

// Abrir inmediatamente, sin esperar las imágenes
$("#calEventDetailModal").hidden = false;

    }


    /* ======================================
       MESES FUTUROS
    ====================================== */

    function renderFutureMonths() {

        const container = $("#calFutureMonths");

        const nextMonths = [];

        for (let i = 1; i <= 3; i++) {
            nextMonths.push(new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + i,
                1
            ));
        }

        container.innerHTML = `
            <div class="cal-list-view">

                ${nextMonths.map(date => {

                    const label = new Intl.DateTimeFormat("es-PY", {
                        month: "long",
                        year: "numeric"
                    }).format(date);

                    const count = getEventsForMonth(date).length;

                    return `
                        <button type="button"
                            class="cal-list-item"
                            data-go-month="${localDateKey(date).slice(0, 7)}">

                            <strong>
                                ${escapeHTML(
                                    label.charAt(0).toUpperCase() +
                                    label.slice(1)
                                )}
                            </strong>

                            <span>${count} eventos registrados</span>
                        </button>
                    `;
                }).join("")}

            </div>
        `;
    }


    /* ======================================
       FORMULARIO
    ====================================== */

    function openModal(event = null) {

        if (!canManage()) return;

        editingEventId = event?.id || null;

        const form = $("#calEventForm");
        form.reset();

        // Limpiar imágenes pendientes del evento anterior
croppedFiles = [];

$("#calEventImages").value = "";

updateCropFilesStatus(
    "Todavía no hay imágenes preparadas.",
    false
);

        $("#calModalTitle").textContent =
            event ? "Editar evento" : "Nuevo evento";

        $("#calSaveEvent").textContent =
            event ? "Guardar cambios" : "Guardar evento";

        $("#calStartDate").value = event
            ? inputDate(event.start_at)
            : localDateKey(selectedDate);

        $("#calEndDate").value = event?.end_at
            ? inputDate(event.end_at)
            : "";

        $("#calEventName").value = event?.title || "";
        $("#calEventCategory").value = event?.category || "";
        $("#calEventStatus").value = event?.status || "planificado";

        $("#calLaunchName").value = event?.launch_name || "";
        $("#calEventDescription").value = event?.description || "";
        $("#calEventLocation").value = event?.location_name || "";
        $("#calEventMapUrl").value = event?.location_url || "";
        $("#calEventUrl").value = event?.event_url || "";

        $("#calEventBrandScope").value =
            event?.brand_scope || "all";

        $("#calEventBranchScope").value =
            event?.branch_scope || "not_applicable";

      $("#calEventResponsible").value =
    event?.responsible_user_id || "not_applicable";

$("#calEventArea").value =
    event?.area || "not_applicable";

        $("#calEventBrands").hidden =
            !event || event.brand_scope !== "selected";

        $("#calEventBranches").hidden =
            !event || event.branch_scope !== "selected";

        $$(`#calEventBrands input`).forEach(box => {
            box.checked = event?.brands.some(
                brand => brand.id === box.value
            ) || false;
        });

        $$(`#calEventBranches input`).forEach(box => {
            box.checked = event?.branches.some(
                branch => branch.id === box.value
            ) || false;
        });

        toggleLaunchField();

        $("#calEventModal").hidden = false;
    }


    function closeModal() {
        $("#calEventModal").hidden = true;
        editingEventId = null;
    }


    function toggleLaunchField() {
        $("#calLaunchField").hidden =
            $("#calEventCategory").value !== "lanzamiento";
    }


    function selectedOptions(container) {
        return Array.from(
            container.querySelectorAll("input:checked")
        ).map(input => input.value);
    }


    /* ======================================
       GUARDAR EVENTO Y ARCHIVOS
    ====================================== */

    async function uploadAttachments(eventId, files) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        for (const file of files) {

            if (!allowedTypes.includes(file.type)) {
                throw new Error(
                    `Formato no permitido: ${file.name}`
                );
            }

            if (file.size > 10 * 1024 * 1024) {
                throw new Error(
                    `${file.name} supera el límite de 10 MB.`
                );
            }

            const safeName = file.name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9._-]/g, "_")
                .slice(-100);

            const unique = crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

            const path = `${user.id}/${eventId}/${unique}_${safeName}`;

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(path, file, {
                    contentType: file.type,
                    cacheControl: "3600",
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { error: metadataError } = await supabase
                .from("calendar_event_attachments")
                .insert({
                    event_id: eventId,
                    storage_path: path,
                    file_name: file.name,
                    mime_type: file.type,
                    size_bytes: file.size,
                    uploaded_by: user.id
                });

            if (metadataError) {
                await supabase.storage.from(BUCKET).remove([path]);
                throw metadataError;
            }
        }
    }


/* ======================================
   EDITOR DE ENCUADRE DE FOTOGRAFÍAS
====================================== */

function openCropEditor(files) {

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    const validFiles = Array.from(files).filter(file => {
        if (!allowed.includes(file.type)) {
            showToast(`${file.name}: formato no permitido.`, "error");
            return false;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast(`${file.name}: supera el límite de 10 MB.`, "error");
            return false;
        }

        return true;
    });

    if (!validFiles.length) return;

    cropQueue = validFiles;
    cropIndex = 0;
    cropBatchResults = [];
    croppedFiles = [];

    loadCropImage();
}

function updateCropFilesStatus(message, ready = false) {
    const status = $("#calImageSelectionStatus");
    const pickerText = $("#calImagePickerText");

    if (status) {
        status.textContent = message;
        status.classList.toggle("is-ready", ready);
    }

    if (pickerText) {
        pickerText.textContent = ready
            ? `${croppedFiles.length} imagen(es) preparada(s)`
            : "Podés seleccionar varias imágenes";
    }
}


function loadCropImage() {

    if (cropObjectUrl) {
        URL.revokeObjectURL(cropObjectUrl);
    }

    const file = cropQueue[cropIndex];

    cropObjectUrl = URL.createObjectURL(file);
    cropImage = new Image();

    cropImage.onload = function () {

        cropZoom = 1;
        cropOffsetX = 0;
        cropOffsetY = 0;

        $("#calCropZoom").value = 1;
        $("#calCropZoomValue").textContent = "100%";

        $("#calCropCounter").textContent =
            `Imagen ${cropIndex + 1} de ${cropQueue.length}`;

        $("#calCropPrevious").disabled = cropIndex === 0;

        $("#calCropConfirm").textContent =
            cropIndex === cropQueue.length - 1
                ? "Confirmar encuadre"
                : "Siguiente imagen";

        $("#calCropModal").hidden = false;

        updateCropCanvas();
    };

    cropImage.onerror = function () {
        showToast("No se pudo abrir esta fotografía.", "error");
        closeCropEditor();
    };

    cropImage.src = cropObjectUrl;
}


/* CONFIGURAR FORMATO */

function updateCropCanvas() {

    if (!cropImage) return;

    const canvas = $("#calCropCanvas");
    const context = canvas.getContext("2d");

    const aspect = $("#calCropAspect").value;

    if (aspect === "1:1") {
        canvas.width = 900;
        canvas.height = 900;
        canvas.style.aspectRatio = "1 / 1";
    } else {
        canvas.width = 1200;
        canvas.height = 675;
        canvas.style.aspectRatio = "16 / 9";
    }

    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);

    context.fillStyle = "#e9edf2";
    context.fillRect(0, 0, width, height);

    const baseScale = Math.max(
        width / cropImage.naturalWidth,
        height / cropImage.naturalHeight
    );

    const scale = baseScale * cropZoom;

    const imageWidth = cropImage.naturalWidth * scale;
    const imageHeight = cropImage.naturalHeight * scale;

    const maxX = Math.max(0, (imageWidth - width) / 2);
    const maxY = Math.max(0, (imageHeight - height) / 2);

    cropOffsetX = Math.max(-maxX, Math.min(maxX, cropOffsetX));
    cropOffsetY = Math.max(-maxY, Math.min(maxY, cropOffsetY));

    const x = (width - imageWidth) / 2 + cropOffsetX;
    const y = (height - imageHeight) / 2 + cropOffsetY;

    context.drawImage(
        cropImage,
        x,
        y,
        imageWidth,
        imageHeight
    );
}


/* CONTROLAR EL ZOOM */

function handleCropZoom(value) {

    cropZoom = Number(value);

    $("#calCropZoomValue").textContent =
        `${Math.round(cropZoom * 100)}%`;

    updateCropCanvas();
}


/* MOVER LA FOTOGRAFÍA */

function startCropDrag(event) {

    if (!cropImage) return;

    cropDragging = true;

    cropLastPointerX = event.clientX;
    cropLastPointerY = event.clientY;

    $("#calCropCanvas").setPointerCapture(event.pointerId);
}


function moveCropDrag(event) {

    if (!cropDragging) return;

    const canvas = $("#calCropCanvas");
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    cropOffsetX +=
        (event.clientX - cropLastPointerX) * scaleX;

    cropOffsetY +=
        (event.clientY - cropLastPointerY) * scaleY;

    cropLastPointerX = event.clientX;
    cropLastPointerY = event.clientY;

    updateCropCanvas();
}


function stopCropDrag() {
    cropDragging = false;
}


/* EXPORTAR FOTOGRAFÍA RECORTADA */

function exportCroppedImage() {

    const canvas = $("#calCropCanvas");

    return new Promise((resolve, reject) => {

        canvas.toBlob(blob => {

            if (!blob) {
                reject(new Error("No se pudo procesar la imagen."));
                return;
            }

            const original = cropQueue[cropIndex];

            const baseName = original.name.replace(/\.[^.]+$/, "");

            const croppedFile = new File(
                [blob],
                `${baseName}_recortada.jpg`,
                {
                    type: "image/jpeg",
                    lastModified: Date.now()
                }
            );

            resolve(croppedFile);

        }, "image/jpeg", 0.92);
    });
}


/* CONFIRMAR Y PASAR A LA SIGUIENTE */

async function confirmCrop() {

    const button = $("#calCropConfirm");

    button.disabled = true;

    try {

        const result = await exportCroppedImage();

        cropBatchResults[cropIndex] = result;

        if (cropIndex < cropQueue.length - 1) {

            cropIndex++;
            loadCropImage();

        } else {

           croppedFiles = cropBatchResults.slice();

closeCropEditor(true);

const count = croppedFiles.length;

updateCropFilesStatus(
    `${count} ${count === 1 ? "imagen lista" : "imágenes listas"} para adjuntar.`,
    true
);

showToast({
    type: "info",
    title: "Imágenes preparadas",
    message: `${count} imagen(es) listas para adjuntar.`
});

}

}catch (error) {

        console.error("Error al recortar:", error);

        showToast(
            "No se pudo procesar la fotografía. Intentá nuevamente.",
            "error"
        );

    } finally {

        button.disabled = false;
    }
}


/* VOLVER A LA IMAGEN ANTERIOR */

function previousCrop() {

    if (cropIndex <= 0) return;

    cropIndex--;
    loadCropImage();
}


/* CERRAR EL EDITOR */

function closeCropEditor(keepResults = false) {

    $("#calCropModal").hidden = true;

    if (cropObjectUrl) {
        URL.revokeObjectURL(cropObjectUrl);
        cropObjectUrl = null;
    }

    cropImage = null;
    cropQueue = [];
    cropBatchResults = [];
    cropIndex = 0;
    cropDragging = false;

    if (!keepResults) {
        croppedFiles = [];
    }

    $("#calEventImages").value = "";
}

/* ==========================================
   LECTOR DE ARCHIVOS EXCEL
========================================== */

// Cargar SheetJS solamente cuando se necesite.
function ensureXLSXLibrary() {
    if (window.XLSX) return Promise.resolve();

    if (!xlsxLoadingPromise) {
        xlsxLoadingPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src =
                "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

            script.async = true;

            script.onload = () => {
                if (window.XLSX) {
                    resolve();
                } else {
                    reject(new Error("No se pudo inicializar el lector Excel."));
                }
            };

            script.onerror = () => {
                xlsxLoadingPromise = null;
                reject(new Error("No se pudo cargar el lector Excel."));
            };

            document.head.appendChild(script);
        });
    }

    return xlsxLoadingPromise;
}


// Normalizar textos para reconocer marcas y meses.
function normalizeImportText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}


// Leer también las celdas combinadas del Excel.
function getImportCell(sheet, row, column) {
    const address = XLSX.utils.encode_cell({
        r: row,
        c: column
    });

    const directCell = sheet[address];

    if (
        directCell &&
        directCell.v !== undefined &&
        directCell.v !== null &&
        directCell.v !== ""
    ) {
        return directCell.v;
    }

    const merges = sheet["!merges"] || [];

    for (const merge of merges) {
        if (
            row >= merge.s.r &&
            row <= merge.e.r &&
            column >= merge.s.c &&
            column <= merge.e.c
        ) {
            const origin = XLSX.utils.encode_cell({
                r: merge.s.r,
                c: merge.s.c
            });

            return sheet[origin]?.v ?? null;
        }
    }

    return null;
}


// Convertir día, mes y año a YYYY-MM-DD.
function buildImportDate(day, month) {
    if (!day || !month || day < 1 || day > 31) {
        return "";
    }

    // Usar el año actual. Si la fecha quedaría más de 6 meses
    // en el pasado (ej.: importar enero estando en diciembre),
    // se asume que corresponde al año siguiente.
    const today = new Date();
    let year = today.getFullYear();

    const monthsAgo =
        (today.getFullYear() - year) * 12 +
        today.getMonth() - (month - 1);

    if (monthsAgo > 6) year += 1;

    const date = new Date(year, month - 1, day);

    // Evitar fechas inexistentes.
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return "";
    }

    return localDateKey(date);
}


// Reconocer los períodos del Excel Q4 2026.
function parseImportDate(value, currentMonth) {

    const result = {
        startDate: "",
        endDate: "",
        needsReview: false,
        reasons: []
    };

    if (value === null || value === undefined || value === "") {
        result.needsReview = true;
        result.reasons.push("Falta la fecha.");
        return result;
    }

    let text = String(value).trim();

    const normalized = normalizeImportText(text);

    // Detectar fechas que necesitan confirmación.
    if (
        /A CONFIRMAR|A DEFINIR|FECHA A DEFINIR|PROPONEMOS|VALIDAR|EXTIENDE/.test(normalized)
    ) {
        result.needsReview = true;
        result.reasons.push("La fecha requiere confirmación.");
    }

    // Fechas con mes escrito: 5/noviembre.
    const namedDate = normalized.match(
        /(\d{1,2})\s*\/\s*(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/
    );

    const monthNames = {
        ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4,
        MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
        SEPTIEMBRE: 9, SETIEMBRE: 9,
        OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12
    };

    if (namedDate) {
        result.startDate = buildImportDate(
            Number(namedDate[1]),
            monthNames[namedDate[2]]
        );

        if (!result.startDate) {
            result.reasons.push("La fecha no es válida.");
            result.needsReview = true;
        }

        return result;
    }

    // Fechas numéricas de Excel.
    if (typeof value === "number") {

        if (
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 31 &&
            currentMonth
        ) {
            result.startDate = buildImportDate(
                value,
                currentMonth
            );

            return result;
        }

        const excelDate = XLSX.SSF.parse_date_code(value);

        if (excelDate?.y && excelDate?.m && excelDate?.d) {
            result.startDate = buildImportDate(
                excelDate.d,
                excelDate.m
            );

            result.endDate = "";

            return result;
        }
    }

    // Fechas expresadas como período: del 1 al 24.
    const range = normalized.match(
        /DEL\s+(\d{1,2})\s+A(?:L|K)\s+(\d{1,2})/
    );

    if (range && currentMonth) {

        result.startDate = buildImportDate(
            Number(range[1]),
            currentMonth
        );

        result.endDate = buildImportDate(
            Number(range[2]),
            currentMonth
        );

        if (!result.startDate || !result.endDate) {
            result.needsReview = true;
            result.reasons.push("Revisar el período detectado.");
        }

        return result;
    }

    // Fecha individual: 7.
    const singleDay = normalized.match(/^(\d{1,2})$/);

    if (singleDay && currentMonth) {

        result.startDate = buildImportDate(
            Number(singleDay[1]),
            currentMonth
        );

        return result;
    }

    result.needsReview = true;
    result.reasons.push("No se pudo reconocer la fecha automáticamente.");

    return result;
}


// Relacionar las abreviaturas del Excel con el catálogo de marcas.
function mapImportBrands(value) {

    const aliases = {
        MTL: "MARTEL",
        MARTEL: "MARTEL",
        WR: "WRANGLER",
        WRANGLER: "WRANGLER",
        LEE: "LEE",
        AO: "AO",
        BROOKS: "BROOKS",
        ENERBIKE: "ENERBIKE"
    };

    const tokens = String(value ?? "")
        .split(/[\/,;]+/)
        .map(item => normalizeImportText(item))
        .filter(Boolean);

    const ids = [];
    const unknown = [];

    tokens.forEach(token => {

        const targetName = aliases[token] || token;

        const found = brands.find(item =>
            normalizeImportText(item.name) === targetName
        );

        if (found) {
            if (!ids.includes(found.id)) {
                ids.push(found.id);
            }
        } else {
            unknown.push(token);
        }
    });

    return { ids, unknown };
}


// Detectar categoría sugerida según el nombre.
function suggestImportCategory(title) {

    const value = normalizeImportText(title);

    if (value.includes("LANZAMIENTO")) return "lanzamiento";
    if (value.includes("FERIA") || value.includes("GARAGE")) return "feria";
    if (value.includes("BRUNCH")) return "contenido";

    return "campana";
}


// Identificar el tipo de columna según su encabezado.
function getImportHeaderType(value) {
    const h = normalizeImportText(value)
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();

    if (!h) return null;

    const matches = aliases =>
        aliases.some(alias => h === alias || h.includes(alias));

    if (matches([
        "FECHA FIN", "FECHA FINAL", "FINALIZACION",
        "HASTA", "END DATE", "ENDING"
    ])) return "endDate";

    if (matches([
        "MARCA", "MARCAS", "BRAND", "BRANDS",
        "NOMBRE MARCA"
    ])) return "brand";

    if (matches([
        "COMUNICACION", "EVENTO", "ACTIVIDAD",
        "CAMPANA", "PROMOCION", "NOMBRE",
        "TITLE", "CAMPAIGN"
    ])) return "title";

    if (matches([
        "DETALLE", "DESCRIPCION", "OBSERVACIONES",
        "NOTAS", "COMENTARIOS", "MECANICA",
        "DESCRIPTION", "DETAIL"
    ])) return "detail";

    if (matches([
        "FECHAS", "FECHA", "PERIODO", "VIGENCIA",
        "FECHA INICIO", "INICIO", "DESDE",
        "START DATE", "DATE", "DATES"
    ])) return "date";

    return null;
}


// Buscar la tabla en todas las hojas y posiciones.
function detectImportTable(workbook) {
    let bestMatch = null;

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];

        if (!sheet || !sheet["!ref"]) continue;

        const range = XLSX.utils.decode_range(sheet["!ref"]);

        const lastHeaderRow = Math.min(
            range.e.r,
            range.s.r + 150
        );

        for (
            let row = range.s.r;
            row <= lastHeaderRow;
            row++
        ) {
            const columns = {};

            for (let col = range.s.c; col <= range.e.c; col++) {
                const value = getImportCell(sheet, row, col);
                const type = getImportHeaderType(value);

                if (type && columns[type] === undefined) {
                    columns[type] = col;
                }
            }

            // Fecha y nombre de actividad son necesarios.
            if (
                columns.date === undefined ||
                columns.title === undefined
            ) {
                continue;
            }

            const score =
                4 +
                (columns.brand !== undefined ? 3 : 0) +
                (columns.detail !== undefined ? 2 : 0) +
                (columns.endDate !== undefined ? 1 : 0);

            if (!bestMatch || score > bestMatch.score) {
                bestMatch = {
                    sheet,
                    sheetName,
                    headerRow: row,
                    columns,
                    range,
                    score
                };
            }
        }
    }

    if (!bestMatch) {
        throw new Error(
            "No pude identificar automáticamente las columnas de fechas y eventos. Revisá el Excel."
        );
    }

    return bestMatch;
}


// Reconocer meses aunque estén en filas separadoras.
function findImportMonth(sheet, row, range) {
    const months = {
        ENERO: 1,
        FEBRERO: 2,
        MARZO: 3,
        ABRIL: 4,
        MAYO: 5,
        JUNIO: 6,
        JULIO: 7,
        AGOSTO: 8,
        SEPTIEMBRE: 9,
        SETIEMBRE: 9,
        OCTUBRE: 10,
        NOVIEMBRE: 11,
        DICIEMBRE: 12
    };

    for (let col = range.s.c; col <= range.e.c; col++) {
        const value = normalizeImportText(
            getImportCell(sheet, row, col)
        );

        if (months[value]) {
            return months[value];
        }
    }

    return null;
}
// Convertir las filas del Excel en eventos.
function parseCalendarWorkbook(workbook) {
importIgnoredRows = [];
    const source = detectImportTable(workbook);

    const {
        sheet,
        sheetName,
        headerRow,
        columns,
        range
    } = source;

    const parsedEvents = [];

    let currentMonth = null;
    let lastEvent = null;

    const readColumn = (row, name) => {
        const col = columns[name];

        return col === undefined
            ? null
            : getImportCell(sheet, row, col);
    };

    function addReview(event, message) {
        if (!event.reviewReasons.includes(message)) {
            event.reviewReasons.push(message);
        }

        event.needsReview = true;
    }

    function appendDescription(event, text) {
        const note = String(text || "").trim();

        if (
            note &&
            !event.description.includes(note)
        ) {
            event.description = [
                event.description,
                note
            ].filter(Boolean).join("\n\n");
        }
    }

    for (
        let row = headerRow + 1;
        row <= range.e.r;
        row++
    ) {
        const month = findImportMonth(sheet, row, range);

        const rawDate = readColumn(row, "date");
        const rawEndDate = readColumn(row, "endDate");
        const rawBrand = readColumn(row, "brand");
        const rawTitle = readColumn(row, "title");
        const rawDetail = readColumn(row, "detail");

        const title = String(rawTitle ?? "").trim();
        const detail = String(rawDetail ?? "").trim();
        const brandText = String(rawBrand ?? "").trim();

        if (month) {
    currentMonth = month;
}

const monthLabels = {
    1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
    5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
    9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE"
};

const monthLabel = monthLabels[month];

const rowValues = [];

for (let col = range.s.c; col <= range.e.c; col++) {
    const value = getImportCell(sheet, row, col);

    if (value !== null && value !== undefined && String(value).trim()) {
        rowValues.push(normalizeImportText(value));
    }
}

// Identificar filas que contienen únicamente el nombre del mes.
const isMonthHeader =
    monthLabel &&
    rowValues.length > 0 &&
    rowValues.every(value =>
        value === monthLabel ||
        (monthLabel === "SEPTIEMBRE" && value === "SETIEMBRE")
    );

if (isMonthHeader) {
    importIgnoredRows.push({
        month: monthLabel,
        sourceRow: row + 1
    });

    lastEvent = null;
    continue;
}

        if (
            rawDate === null &&
            rawEndDate === null &&
            !brandText &&
            !title &&
            !detail
        ) {
            continue;
        }

        const parsedDate = parseImportDate(
            rawDate,
            currentMonth
        );

        const parsedEnd = rawEndDate !== null &&
                          rawEndDate !== ""
            ? parseImportDate(rawEndDate, currentMonth)
            : null;

        let startDate = parsedDate.startDate;
        let endDate = parsedDate.endDate;

        const reviewReasons = [
            ...parsedDate.reasons
        ];

        if (parsedEnd) {
            endDate = parsedEnd.startDate ||
                      parsedEnd.endDate;

            reviewReasons.push(...parsedEnd.reasons);
        }

        // Interpretar filas que continúan una actividad anterior.
        if (!title && lastEvent) {

            const continuation =
                brandText ||
                detail ||
                rawDate !== null;

            if (continuation) {

                if (brandText) {
                    const mapped = mapImportBrands(brandText);

                    mapped.ids.forEach(id => {
                        if (!lastEvent.brandIds.includes(id)) {
                            lastEvent.brandIds.push(id);
                        }
                    });

                    mapped.unknown.forEach(name => {
                        if (!lastEvent.unknownBrands.includes(name)) {
                            lastEvent.unknownBrands.push(name);
                        }
                    });

                    if (mapped.unknown.length) {
                        addReview(
                            lastEvent,
                            "Hay marcas de continuación sin identificar."
                        );
                    }
                }

                appendDescription(lastEvent, detail);

                // Algunas notas están escritas en la columna de fechas.
                if (
                    rawDate &&
                    !parsedDate.startDate &&
                    !parsedDate.endDate
                ) {
                    appendDescription(lastEvent, rawDate);
                    addReview(
                        lastEvent,
                        "Se encontró una nota en la columna de fechas."
                    );
                }

                if (!brandText && detail) {
                    addReview(
                        lastEvent,
                        "Se agregó una nota de una fila de continuación."
                    );
                }

                lastEvent.sourceRows.push(row + 1);
                continue;
            }
        }

        // Si una nueva actividad no repite la fecha,
        // proponer la fecha anterior, pero pedir confirmación.
        if (!startDate && title && lastEvent?.startDate) {
            startDate = lastEvent.startDate;
            endDate = parsedEnd?.startDate ||
                      parsedEnd?.endDate ||
                      lastEvent.endDate;

            reviewReasons.push(
                "Fecha heredada de la actividad anterior. Confirmar."
            );
        }

        const mappedBrands = mapImportBrands(brandText);

        const event = {
            importId: `${sheetName}-${row + 1}`,

            title,
            startDate,
            endDate: endDate || "",

            description: detail,

            brandIds: mappedBrands.ids,
            unknownBrands: mappedBrands.unknown,

            category: suggestImportCategory(title),
            area: "",

            status: "planificado",

            needsReview: false,
            reviewReasons: [],

            sourceRows: [row + 1]
        };

        event.reviewReasons.push(...reviewReasons);

        if (!event.title) {
            addReview(event, "Falta el nombre del evento.");
        }

        if (!event.startDate) {
            addReview(event, "Falta una fecha de inicio reconocible.");
        }

        if (
            event.startDate &&
            event.endDate &&
            event.endDate < event.startDate
        ) {
            addReview(
                event,
                "La fecha de finalización es anterior al inicio."
            );
        }

        if (!event.brandIds.length) {
            addReview(
                event,
                "Falta asociar una marca del catálogo."
            );
        }

        if (event.unknownBrands.length) {
            addReview(
                event,
                "Marcas sin coincidencia: " +
                event.unknownBrands.join(", ")
            );
        }

        // Detectar posibles duplicados del calendario actual.
        const duplicate = events.some(existing =>
            normalizeImportText(existing.title) ===
                normalizeImportText(event.title) &&
            inputDate(existing.start_at) === event.startDate
        );

        if (duplicate) {
            addReview(
                event,
                "Posible evento duplicado en el calendario."
            );
        }

        parsedEvents.push(event);
        lastEvent = event;
    }

    if (!parsedEvents.length) {
        throw new Error(
            "No se encontraron actividades en el archivo."
        );
    }

    return parsedEvents;
}

/* ==========================================
   VISTA PREVIA DE IMPORTACIÓN
========================================== */

/* ==========================================
   VALIDACIÓN Y ESTADO DE LOS EVENTOS
========================================== */

function getImportItemState(item) {

    const errors = [];
    const warnings = [];

    if (!item.title?.trim()) {
        errors.push({ field: "title", message: "Falta el nombre." });
    }

    if (!item.startDate) {
        errors.push({ field: "startDate", message: "Falta la fecha de inicio." });
    }

    if (
        item.startDate &&
        item.endDate &&
        item.endDate < item.startDate
    ) {
        errors.push({
            field: "endDate",
            message: "La finalización es anterior al inicio."
        });
    }

    if (!item.category) {
        errors.push({ field: "category", message: "Seleccioná una categoría." });
    }

    if (!item.area) {
        errors.push({ field: "area", message: "Seleccioná un área." });
    }

    if (
        !item.brandIds?.length &&
        !item.allowNoBrand &&
        !item.unknownBrands?.length
    ) {
        errors.push({
            field: "brandIds",
            message: "Asociá una marca o autorizá importar sin marca."
        });
    }

    const reasons = item.reviewReasons || [];

    if (item.needsReview && !item.reviewConfirmed) {
        reasons.forEach(reason => {
            if (
                item.allowNoBrand &&
                /marca/i.test(reason)
            ) return;

            warnings.push(reason);
        });
    }

    if (
        item.unknownBrands?.length &&
        !item.allowNoBrand
    ) {
        warnings.push(
            "Marcas no encontradas: " +
            item.unknownBrands.join(", ")
        );
    }

    const status = errors.length
        ? "incomplete"
        : warnings.length
            ? "review"
            : "ready";

    return { errors, warnings, status };
}


function getImportMonth(item) {

    if (!item.startDate) return "Fechas pendientes";

    const date = new Date(`${item.startDate}T12:00:00`);

    // Incluir el año para no mezclar, por ejemplo,
    // octubre de 2026 con octubre de 2027.
    return new Intl.DateTimeFormat("es-PY", {
        month: "long",
        year: "numeric"
    }).format(date).toUpperCase();
}


/* ==========================================
   VISTA PREVIA EN TARJETAS
========================================== */

function renderImportPreview() {

    const preview = $("#calImportPreview");
    const summary = $("#calImportSummary");
    const alerts = $("#calImportAlerts");
    const confirmButton = $("#calImportConfirm");

    const entries = importPreviewEvents.map((item, index) => ({
        item,
        index,
        state: getImportItemState(item)
    }));

    const counts = {
        all: entries.length,
        review: entries.filter(x => x.state.status === "review").length,
        incomplete: entries.filter(x => x.state.status === "incomplete").length,
        ready: entries.filter(x => x.state.status === "ready").length,
        ignored: importIgnoredRows.length
    };

    const selectedCount = importPreviewEvents.filter(
        item => item.selectedForImport
    ).length;

    summary.textContent =
        `${counts.all} eventos · ${counts.ready} listos para importar · ` +
        `${counts.ignored} ignorados`;

    const progress = counts.all
        ? Math.round(counts.ready / counts.all * 100)
        : 0;

    const categoryOptions = Object.entries(CATEGORIES)
        .map(([value, label]) =>
            `<option value="${value}">${escapeHTML(label)}</option>`
        ).join("");

    const areaOptions = [
        ["marketing", "Marketing"],
        ["brands", "Brands"],
        ["retail", "Retail"],
        ["mayorista", "Mayorista"],
        ["otros", "Otros"],
        ["not_applicable", "No aplica"]
    ];

    const areaOptionsHTML = areaOptions
        .map(([value, label]) =>
            `<option value="${value}">${label}</option>`
        ).join("");

    alerts.innerHTML = importIgnoredRows.length
        ? `
            <div class="cal-import-alert warning cal-import-month-alert">
                <span>
                    ${importIgnoredRows.map(row => `“${escapeHTML(row.month)}”`).join(", ").replace(/, ([^,]*)$/, " y $1")}
                    se detectaron como títulos de mes y no se importarán.
                </span>
                <button type="button" data-import-filter="ignored">
                    Ver ignorados
                </button>
            </div>
        `
        : `
            <div class="cal-import-alert success">
                Los encabezados y las actividades fueron procesados.
                Revisá los campos pendientes antes de importar.
            </div>
        `;

    const filtersHTML = `
        <div class="cal-import-tabs">

            <button type="button" data-import-filter="all"
                class="${importPreviewFilter === "all" ? "active" : ""}">
                Todos <b>${counts.all}</b>
            </button>

            <button type="button" data-import-filter="review"
                class="${importPreviewFilter === "review" ? "active" : ""}">
                Revisar <b>${counts.review}</b>
            </button>

            <button type="button" data-import-filter="incomplete"
                class="${importPreviewFilter === "incomplete" ? "active" : ""}">
                Incompletos <b>${counts.incomplete}</b>
            </button>

            <button type="button" data-import-filter="ready"
                class="${importPreviewFilter === "ready" ? "active" : ""}">
                Listos <b>${counts.ready}</b>
            </button>

            <button type="button" data-import-filter="ignored"
                class="${importPreviewFilter === "ignored" ? "active" : ""}">
                Ignorados <b>${counts.ignored}</b>
            </button>

        </div>
    `;

    // Asignación masiva compacta: se aplica al elegir una opción
    // del desplegable (sobre los eventos tildados).
    const bulkHTML = `
        <div class="cal-import-bulk">

            ${
                selectedCount
                    ? `<span class="cal-import-bulk-count">${selectedCount} seleccionados</span>`
                    : ""
            }

            <select id="calImportBulkArea"
                aria-label="Asignar área a los eventos seleccionados">
                <option value="">Asignar área a seleccionados</option>
                ${areaOptionsHTML}
            </select>

            <select id="calImportBulkCategory"
                aria-label="Asignar categoría a los eventos seleccionados">
                <option value="">Asignar categoría</option>
                ${categoryOptions}
            </select>

        </div>
    `;

    // Vista de eventos ignorados.
    if (importPreviewFilter === "ignored") {

        preview.innerHTML = `
            <div class="cal-import-toolbar">${filtersHTML}</div>
        ` + `
            <div class="cal-import-ignored-list">

                ${
                    importIgnoredRows.length
                        ? importIgnoredRows.map((row, index) => `
                            <div class="cal-import-ignored-item">
                                <div>
                                    <strong>${escapeHTML(row.month)}</strong>
                                    <small>
                                        Encabezado detectado en la fila ${row.sourceRow}
                                    </small>
                                </div>

                                <button type="button"
                                    data-import-restore="${index}">
                                    Restaurar como evento
                                </button>
                            </div>
                        `).join("")
                        : `<p>No hay filas ignoradas.</p>`
                }

            </div>
        `;

        updateImportConfirmButton(confirmButton);
        return;
    }

    const filteredEntries = entries.filter(entry => {
        if (importPreviewFilter === "all") return true;
        return entry.state.status === importPreviewFilter;
    });

    // Agrupar por mes.
    const groups = new Map();

    filteredEntries.forEach(entry => {

        const month = getImportMonth(entry.item);

        if (!groups.has(month)) {
            groups.set(month, []);
        }

        groups.get(month).push(entry);
    });

    function errorText(state, field) {
        const error = state.errors.find(
            item => item.field === field
        );

        return error
            ? `<small class="cal-import-field-error">${escapeHTML(error.message)}</small>`
            : "";
    }

    function renderCard(entry) {

        const { item, index, state } = entry;

        const statusLabels = {
            ready: "Listo",
            review: "Revisar",
            incomplete: "Incompleto"
        };

        const brandsHTML = brands.map(brand => {

            const active = item.brandIds?.includes(brand.id);

            return `
                <button type="button"
                    class="cal-import-brand-chip ${active ? "selected" : ""}"
                    data-import-brand="${escapeHTML(brand.id)}"
                    data-import-index="${index}"
                    aria-pressed="${Boolean(active)}">

                    ${active ? "✓ " : ""}
                    ${escapeHTML(brand.name)}

                </button>
            `;
        }).join("");

        // Evitar repetir los avisos de marcas que ya muestra
        // el recuadro "Marcas fuera del catálogo".
        const showBrandWarning =
            item.unknownBrands?.length && !item.allowNoBrand;

        const reviewReasons = showBrandWarning
            ? state.warnings.filter(reason => !/marca/i.test(reason))
            : state.warnings;

        return `
            <article class="cal-import-card state-${state.status}">

                <!-- PRIMERA LÍNEA -->

                <div class="cal-import-card-top">

                    <label class="cal-import-select">
                        <input type="checkbox"
                            data-import-select="${index}"
                            ${item.selectedForImport ? "checked" : ""}>
                    </label>

                    <div class="cal-import-field cal-import-title-field
                        ${errorText(state, "title") ? "is-invalid" : ""}">

                        <label>
                            Evento
                            <span class="cal-import-status ${state.status}">
                                ${statusLabels[state.status]}
                            </span>
                        </label>

                        <input type="text"
                            data-import-field="title"
                            data-import-index="${index}"
                            value="${escapeHTML(item.title)}"
                            placeholder="Nombre del evento">

                        ${errorText(state, "title")}

                    </div>

                    <div class="cal-import-field
                        ${errorText(state, "startDate") ? "is-invalid" : ""}">

                        <label>Inicio</label>

                        <input type="date"
                            data-import-field="startDate"
                            data-import-index="${index}"
                            value="${escapeHTML(item.startDate)}">

                        ${errorText(state, "startDate")}

                    </div>

                    <div class="cal-import-field
                        ${errorText(state, "endDate") ? "is-invalid" : ""}">

                        <label>Finalización</label>

                        <input type="date"
                            data-import-field="endDate"
                            data-import-index="${index}"
                            value="${escapeHTML(item.endDate)}">

                        ${errorText(state, "endDate")}

                    </div>

                    <div class="cal-import-field
                        ${errorText(state, "category") ? "is-invalid" : ""}">

                        <label>Categoría</label>

                        <select
                            data-import-field="category"
                            data-import-index="${index}">

                            <option value="">Elegir categoría</option>
                            ${categoryOptions}

                        </select>

                        ${errorText(state, "category")}

                    </div>

                    <div class="cal-import-field
                        ${errorText(state, "area") ? "is-invalid" : ""}">

                        <label>Área *</label>

                        <select
                            data-import-field="area"
                            data-import-index="${index}">

                            <option value="">Elegir área</option>
                            ${areaOptionsHTML}

                        </select>

                        ${errorText(state, "area")}

                    </div>

                </div>

                <!-- SEGUNDA LÍNEA -->

                <div class="cal-import-card-bottom">

                    <div class="cal-import-brands">

                        <label>Marcas</label>

                        <div class="cal-import-brand-chips">
                            ${brandsHTML}
                        </div>

                        ${errorText(state, "brandIds")}

                    </div>

                    <div class="cal-import-description">

                        <label>Descripción</label>

                        <textarea
                            rows="1"
                            data-import-field="description"
                            data-import-index="${index}"
                            placeholder="Descripción del evento">${escapeHTML(item.description)}</textarea>

                    </div>

                </div>

                ${
                    item.unknownBrands?.length && !item.allowNoBrand
                        ? `
                            <div class="cal-import-brand-warning">
                                <strong>
                                    Marcas fuera del catálogo:
                                    ${escapeHTML(item.unknownBrands.join(", "))}
                                </strong>

                                <label>
                                    <input type="checkbox"
                                        data-import-allow-no-brand="${index}">
                                    Importar sin marca asociada
                                </label>
                            </div>
                        `
                        : ""
                }

                ${
                    reviewReasons.length
                        ? `
                            <div class="cal-import-review-box">
                                <ul>
                                    ${reviewReasons.map(reason =>
                                        `<li>${escapeHTML(reason)}</li>`
                                    ).join("")}
                                </ul>
                            </div>
                        `
                        : ""
                }

                <!-- CONFIRMACIÓN Y ELIMINACIÓN -->

                <footer class="cal-import-card-footer">

                    ${
                        item.needsReview
                            ? `
                                <label class="cal-import-review-check">
                                    <input type="checkbox"
                                        data-import-review="${index}"
                                        ${item.reviewConfirmed ? "checked" : ""}>
                                    Confirmé la revisión
                                </label>
                            `
                            : `<span></span>`
                    }

                    <button type="button"
                        class="cal-import-delete"
                        data-import-delete="${index}">
                        🗑 Eliminar evento
                    </button>

                </footer>

            </article>
        `;
    }

    preview.innerHTML = `
        <div class="cal-import-toolbar">
            ${filtersHTML}
            ${bulkHTML}
        </div>

        <div class="cal-import-progress">
            <div style="width:${progress}%"></div>
        </div>

        <div class="cal-import-groups">

            ${
                groups.size
                    ? Array.from(groups.entries()).map(([month, group]) => `
                        <section class="cal-import-month-group">

                            <h3 class="cal-import-month-heading">
                                ${escapeHTML(month)}
                                <span>${group.length} eventos</span>
                            </h3>

                            ${group.map(renderCard).join("")}

                        </section>
                    `).join("")
                    : `<div class="cal-empty">No hay eventos en esta categoría.</div>`
            }

        </div>
    `;

    // Restaurar los valores seleccionados.
    filteredEntries.forEach(({ item, index }) => {

        const category = preview.querySelector(
            `[data-import-field="category"][data-import-index="${index}"]`
        );

        const area = preview.querySelector(
            `[data-import-field="area"][data-import-index="${index}"]`
        );

        if (category) category.value = item.category || "";
        if (area) area.value = item.area || "";

        const description = preview.querySelector(
            `[data-import-field="description"][data-import-index="${index}"]`
        );

        if (description) {
            description.style.height = "auto";
            description.style.height = description.scrollHeight + "px";
        }
    });

    updateImportConfirmButton(confirmButton);
}


// Mostrar en el botón cuántos eventos se van a importar.
// Si hay eventos tildados, cuenta los tildados que están listos;
// si no hay ninguno tildado, cuenta todos los listos.
function getEventsToImport() {

    const ready = importPreviewEvents.filter(
        item => getImportItemState(item).status === "ready"
    );

    const selected = ready.filter(item => item.selectedForImport);

    const anySelected = importPreviewEvents.some(
        item => item.selectedForImport
    );

    return anySelected
        ? { list: selected, mode: "selected" }
        : { list: ready, mode: "ready" };
}

function updateImportConfirmButton(button = $("#calImportConfirm")) {

    if (!button) return;

    const { list, mode } = getEventsToImport();
    const count = list.length;
    const plural = count === 1 ? "evento" : "eventos";
    const suffix = mode === "selected"
        ? (count === 1 ? "seleccionado" : "seleccionados")
        : (count === 1 ? "listo" : "listos");

    button.textContent = count
        ? `Importar ${count} ${plural} ${suffix}`
        : "Importar eventos";

    button.disabled = count === 0;
}


/* ==========================================
   ACTUALIZAR DATOS DE LA VISTA PREVIA
========================================== */

function handleImportPreviewChange(event) {

    const bulkSelect = event.target.closest(
        "#calImportBulkArea, #calImportBulkCategory"
    );

    if (bulkSelect) {

        const value = bulkSelect.value;
        const isArea = bulkSelect.id === "calImportBulkArea";

        if (!value) return;

        const selected = importPreviewEvents.filter(
            item => item.selectedForImport
        );

        if (!selected.length) {
            bulkSelect.value = "";
            showToast("Primero tildá los eventos a los que querés asignar.", "error");
            return;
        }

        selected.forEach(item => {
            item[isArea ? "area" : "category"] = value;
        });

        renderImportPreview();

        showToast(
            `${isArea ? "Área" : "Categoría"} asignada a ${selected.length} eventos.`,
            "success"
        );
        return;
    }

    const review = event.target.closest("[data-import-review]");

    if (review) {
        const index = Number(review.dataset.importReview);
        const item = importPreviewEvents[index];

        if (item) {
            item.reviewConfirmed = review.checked;
            renderImportPreview();
        }

        return;
    }

    const allowNoBrand = event.target.closest(
        "[data-import-allow-no-brand]"
    );

    if (allowNoBrand) {
        const index = Number(allowNoBrand.dataset.importAllowNoBrand);
        const item = importPreviewEvents[index];

        if (item) {
            item.allowNoBrand = allowNoBrand.checked;
            renderImportPreview();
        }

        return;
    }

    const selection = event.target.closest("[data-import-select]");

    if (selection) {
        const index = Number(selection.dataset.importSelect);
        const item = importPreviewEvents[index];

        if (item) {
            item.selectedForImport = selection.checked;
            renderImportPreview();
        }

        return;
    }

    const field = event.target.closest("[data-import-field]");

    if (!field) return;

    const index = Number(field.dataset.importIndex);
    const item = importPreviewEvents[index];

    if (!item) return;

    item[field.dataset.importField] = field.value;

    renderImportPreview();
}


// Ajustar automáticamente la altura de las descripciones.
function handleImportPreviewInput(event) {

    const textarea = event.target.closest(
        '[data-import-field="description"]'
    );

    if (!textarea) return;

    const index = Number(textarea.dataset.importIndex);
    const item = importPreviewEvents[index];

    if (item) {
        item.description = textarea.value;
    }

    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}


// Acciones de tarjetas, marcas, filtros y asignación masiva.
async function handleImportPreviewClick(event) {

    const filter = event.target.closest("[data-import-filter]");

    if (filter) {
        importPreviewFilter = filter.dataset.importFilter;
        renderImportPreview();
        return;
    }

    const brandChip = event.target.closest("[data-import-brand]");

    if (brandChip) {

        const index = Number(brandChip.dataset.importIndex);
        const item = importPreviewEvents[index];
        const brandId = brandChip.dataset.importBrand;

        if (!item) return;

        item.brandIds ||= [];

        item.brandIds = item.brandIds.includes(brandId)
            ? item.brandIds.filter(id => id !== brandId)
            : [...item.brandIds, brandId];

        renderImportPreview();
        return;
    }

    const deleteButton = event.target.closest("[data-import-delete]");

    if (deleteButton) {

        const index = Number(deleteButton.dataset.importDelete);
        const item = importPreviewEvents[index];

        if (!item) return;

        const confirmed = await calConfirm({
            title: "¿Quitar este evento de la importación?",
            message: `"${item.title}" no se va a importar. El archivo Excel no se modifica.`,
            confirmText: "Quitar",
            tone: "danger"
        });

        if (!confirmed) {
            return;
        }

        importPreviewEvents.splice(index, 1);
        renderImportPreview();

        showToast("Evento quitado de la importación.", "info");
        return;
    }

    const restoreButton = event.target.closest("[data-import-restore]");

    if (restoreButton) {

        const index = Number(restoreButton.dataset.importRestore);
        const ignored = importIgnoredRows[index];

        if (!ignored) return;

        importIgnoredRows.splice(index, 1);

        importPreviewEvents.push({
            importId: `restored-${Date.now()}`,
            title: ignored.month,
            startDate: "",
            endDate: "",
            description: "",
            brandIds: [],
            unknownBrands: [],
            category: "",
            area: "",
            status: "planificado",
            needsReview: true,
            reviewConfirmed: false,
            reviewReasons: ["Fila restaurada manualmente. Revisá si corresponde a un evento."],
            sourceRows: [ignored.sourceRow]
        });

        importPreviewFilter = "all";
        renderImportPreview();

        showToast("Fila restaurada para revisión.", "info");
        return;
    }

    // Asignación masiva de área.
    if (event.target.closest("[data-import-bulk-area]")) {

        const value = $("#calImportBulkArea").value;

        const selected = importPreviewEvents.filter(
            item => item.selectedForImport
        );

        if (!selected.length || !value) {
            showToast("Seleccioná eventos y un área.", "error");
            return;
        }

        selected.forEach(item => {
            item.area = value;
        });

        renderImportPreview();
        showToast(`Área asignada a ${selected.length} eventos.`, "success");
        return;
    }

    // Asignación masiva de categoría.
    if (event.target.closest("[data-import-bulk-category]")) {

        const value = $("#calImportBulkCategory").value;

        const selected = importPreviewEvents.filter(
            item => item.selectedForImport
        );

        if (!selected.length || !value) {
            showToast("Seleccioná eventos y una categoría.", "error");
            return;
        }

        selected.forEach(item => {
            item.category = value;
        });

        renderImportPreview();
        showToast(`Categoría asignada a ${selected.length} eventos.`, "success");
    }
}


// Procesar el archivo seleccionado.
async function handleCalendarExcelFile(file) {

    if (!canManage()) {
        showToast("No tenés permisos para importar eventos.", "error");
        return;
    }

    if (!file) return;

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["xlsx", "xls", "csv"].includes(extension)) {
        showToast("Seleccioná un archivo Excel o CSV válido.", "error");
        return;
    }

    const modal = $("#calImportModal");
    const fileName = $("#calImportFileName");
    const summary = $("#calImportSummary");
    const preview = $("#calImportPreview");
    const alerts = $("#calImportAlerts");

    modal.hidden = false;

    fileName.textContent = file.name;
    summary.textContent = "Leyendo archivo...";
    alerts.innerHTML = "";

    preview.innerHTML = `
        <div class="cal-empty">
            Procesando las hojas y buscando las columnas...
        </div>
    `;

    $("#calImportConfirm").disabled = true;
    $("#calImportConfirm").textContent = "Importar eventos";

    try {

        await ensureXLSXLibrary();

        const buffer = await file.arrayBuffer();

        const workbook = XLSX.read(buffer, {
            type: "array",
            cellDates: false
        });

        importPreviewEvents = parseCalendarWorkbook(workbook)
            .map((item, index) => ({
                ...item,
                importId: item.importId || String(index),
                reviewConfirmed: !item.needsReview
            }));

        renderImportPreview();

        // renderImportPreview() ya muestra el aviso correspondiente
        // (títulos de mes ignorados o resumen). No se reemplaza acá
        // para no ocultar el aviso de filas ignoradas.

    } catch (error) {

        console.error("Error al leer Excel:", error);

        importPreviewEvents = [];

        summary.textContent = "No se pudo procesar el archivo.";

        preview.innerHTML = `
            <div class="cal-empty">
                No se pudieron detectar los eventos.
            </div>
        `;

        alerts.innerHTML = `
            <div class="cal-import-alert error">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}

/* ==========================================
   IMPORTAR EVENTOS A SUPABASE
========================================== */

async function importCalendarEvents() {

    if (!canManage() || importInProgress) return;

    const button = $("#calImportConfirm");
    const { list } = getEventsToImport();

    if (!list.length) {
        showToast("No hay eventos listos para importar.", "info");
        return;
    }

    const confirmed = await calConfirm({
        title: `¿Importar ${list.length} ${list.length === 1 ? "evento" : "eventos"} al calendario?`,
        message: "Se van a crear en el calendario con las fechas, marcas y áreas que revisaste.",
        confirmText: "Importar",
        cancelText: "Seguir revisando"
    });

    if (!confirmed) {
        return;
    }

    importInProgress = true;
    button.disabled = true;
    button.textContent = "Importando...";

    const importedItems = [];
    const failures = [];

    try {

        // IMPORTAR UNO POR UNO
        for (const item of list) {

            let createdEventId = null;

            try {

                // Verificar que las marcas existan en el catálogo.
                const selectedBrandIds = [...new Set(
                    (item.brandIds || []).filter(brandId =>
                        brands.some(brand => brand.id === brandId)
                    )
                )];

                if (
                    !selectedBrandIds.length &&
                    !item.allowNoBrand
                ) {
                    throw new Error(
                        "Falta asociar una marca o autorizar la importación sin marca."
                    );
                }

                // Estructura compatible con el formulario actual.
                const payload = {

                    title: item.title.trim(),

                    description:
                        item.description?.trim() || null,

                    launch_name: null,

                    category: item.category,

                    start_at: dateToISO(item.startDate),

                    end_at: item.endDate
                        ? dateToISO(item.endDate, true)
                        : null,

                    all_day: true,

                    status: "planificado",

                    brand_scope: "selected",

                    branch_scope: "not_applicable",

                    responsible_mode: "not_applicable",

                    responsible_user_id: null,

                    area: item.area,

                    updated_by: user.id,

                    created_by: user.id
                };

                // 1. Crear el evento.
                const { data, error } = await supabase
                    .from("calendar_events")
                    .insert(payload)
                    .select("id")
                    .single();

                if (error) throw error;

                if (!data?.id) {
                    throw new Error(
                        "Supabase no devolvió el identificador del evento."
                    );
                }

                createdEventId = data.id;

                // 2. Asociar las marcas seleccionadas.
                if (selectedBrandIds.length) {

                    const { error: brandError } = await supabase
                        .from("calendar_event_brands")
                        .insert(
                            selectedBrandIds.map(brandId => ({
                                event_id: createdEventId,
                                brand_id: brandId
                            }))
                        );

                    if (brandError) throw brandError;
                }

                importedItems.push(item);

            } catch (error) {

                // Intentar revertir un evento si falló
                // la asociación de sus marcas.
                let cleanupMessage = "";

                if (createdEventId) {

                    const { error: cleanupError } = await supabase
                        .from("calendar_events")
                        .delete()
                        .eq("id", createdEventId);

                    if (cleanupError) {

                        cleanupMessage =
                            ` No se pudo revertir el evento creado: ${cleanupError.message}. Revisá el calendario antes de volver a intentar.`;

                        console.error(
                            "Error al revertir evento:",
                            cleanupError
                        );
                    }
                }

                failures.push({
                    title: item.title || "Evento sin nombre",
                    message:
                        `${getFriendlyErrorMessage(error)}${cleanupMessage}`
                });
            }
        }

        // Quitar de la vista previa solamente los eventos
        // que fueron guardados correctamente.
        const importedSet = new Set(importedItems);

        importPreviewEvents = importPreviewEvents.filter(
            item => !importedSet.has(item)
        );

        // Actualizar los eventos del calendario.
        if (importedItems.length) {

            await loadEvents();

            currentDate = dateFromISO(
                dateToISO(importedItems[0].startDate)
            );

            selectedDate = new Date(currentDate);

            renderAll();
        }

        // INFORMAR SI HUBO ERRORES.
        if (failures.length) {

            importPreviewFilter = "all";

            renderImportPreview();

            $("#calImportAlerts").innerHTML = `
                <div class="cal-import-alert error">

                    <strong>
                        ${importedItems.length} importados correctamente.
                        ${failures.length} con problemas.
                    </strong>

                    <ul>
                        ${failures.map(item => `
                            <li>
                                <strong>${escapeHTML(item.title)}:</strong>
                                ${escapeHTML(item.message)}
                            </li>
                        `).join("")}
                    </ul>

                </div>
            `;

            showToast({
                type: "info",
                title: "Importación parcial",
                message:
                    `${importedItems.length} eventos importados. Revisá los ${failures.length} pendientes.`
            });

        } else {

            importPreviewEvents = [];
            importIgnoredRows = [];
            importPreviewFilter = "all";

            $("#calImportModal").hidden = true;

            showToast({
                type: "success",
                title: "Importación completada",
                message:
                    `Se importaron ${importedItems.length} eventos correctamente.`
            });
        }

    } catch (error) {

        console.error("Error general al importar:", error);

        showToast(
            getFriendlyErrorMessage(error),
            "error"
        );

    } finally {

        importInProgress = false;

        updateImportConfirmButton(button);
    }
}

    async function handleFormSubmit(event) {

        event.preventDefault();

        if (!canManage()) return;

        const saveButton = $("#calSaveEvent");
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";

        try {

            const title = $("#calEventName").value.trim();
            const category = $("#calEventCategory").value;

            const startDate = $("#calStartDate").value;
            const endDate = $("#calEndDate").value;

            const brandScope = $("#calEventBrandScope").value;
            const branchScope = $("#calEventBranchScope").value;

            const selectedBrands = selectedOptions($("#calEventBrands"));
            const selectedBranches = selectedOptions($("#calEventBranches"));

            if (endDate && endDate < startDate) {
                throw new Error(
                    "La fecha de finalización no puede ser anterior al inicio."
                );
            }

            if (brandScope === "selected" && !selectedBrands.length) {
                throw new Error(
                    "Seleccioná al menos una marca."
                );
            }

            if (branchScope === "selected" && !selectedBranches.length) {
                throw new Error(
                    "Seleccioná al menos una sucursal."
                );
            }

            const responsible = $("#calEventResponsible").value;

            const payload = {
                title,
                description: $("#calEventDescription").value.trim() || null,
                launch_name: category === "lanzamiento"
                    ? $("#calLaunchName").value.trim() || null
                    : null,
                category,
                start_at: dateToISO(startDate),
                end_at: endDate ? dateToISO(endDate, true) : null,
                all_day: true,
                status: $("#calEventStatus").value,
                brand_scope: brandScope,
                branch_scope: branchScope,
                responsible_mode: responsible === "not_applicable"
                    ? "not_applicable"
                    : "assigned",
                responsible_user_id: responsible === "not_applicable"
                    ? null
                    : responsible,

                    area: $("#calEventArea").value,
                location_name: $("#calEventLocation").value.trim() || null,
                location_url: $("#calEventMapUrl").value.trim() || null,
                event_url: $("#calEventUrl").value.trim() || null,
                updated_by: user.id
            };

            let savedEvent;

            if (editingEventId) {

                const { data, error } = await supabase
                    .from("calendar_events")
                    .update(payload)
                    .eq("id", editingEventId)
                    .select()
                    .single();

                if (error) throw error;

                savedEvent = data;

            } else {

                const { data, error } = await supabase
                    .from("calendar_events")
                    .insert({
                        ...payload,
                        created_by: user.id
                    })
                    .select()
                    .single();

                if (error) throw error;

                savedEvent = data;
            }

            /* Actualizar relaciones de marcas */

            const removeBrands = await supabase
                .from("calendar_event_brands")
                .delete()
                .eq("event_id", savedEvent.id);

            if (removeBrands.error) throw removeBrands.error;

            if (brandScope === "selected") {

                const { error } = await supabase
                    .from("calendar_event_brands")
                    .insert(selectedBrands.map(brandId => ({
                        event_id: savedEvent.id,
                        brand_id: brandId
                    })));

                if (error) throw error;
            }

            /* Actualizar relaciones de sucursales */

            const removeBranches = await supabase
                .from("calendar_event_branches")
                .delete()
                .eq("event_id", savedEvent.id);

            if (removeBranches.error) throw removeBranches.error;

            if (branchScope === "selected") {

                const { error } = await supabase
                    .from("calendar_event_branches")
                    .insert(selectedBranches.map(branchId => ({
                        event_id: savedEvent.id,
                        branch_id: branchId
                    })));

                if (error) throw error;
            }

            /* Subir imágenes */

           const files = croppedFiles.slice();

if (files.length) {
    await uploadAttachments(savedEvent.id, files);
}

croppedFiles = [];
$("#calEventImages").value = "";

            selectedEventId = savedEvent.id;

            closeModal();

            await loadEvents();

currentDate = dateFromISO(savedEvent.start_at);
renderAll();

await renderDetail(savedEvent.id);
showToast(savedEvent.title, "success");

        } catch (error) {

            console.error("Error al guardar el evento:", error);

            showToast(getFriendlyErrorMessage(error), "error");

            await loadEvents();
            renderAll();

        } finally {

            saveButton.disabled = false;
            saveButton.textContent = editingEventId
                ? "Guardar cambios"
                : "Guardar evento";
        }
    }


    /* ======================================
       ELIMINAR ARCHIVOS
    ====================================== */

    
async function deleteAttachment(id) {

    if (!canManageAttachments()) return;

    const attachment = events
        .flatMap(event => event.attachments)
        .find(item => item.id === id);

    if (!attachment) return;

    const confirmed = await calConfirm({
        title: "¿Eliminar esta imagen del evento?",
        message: "La imagen se borra definitivamente.",
        confirmText: "Eliminar",
        tone: "danger"
    });

    if (!confirmed) return;

    try {

        const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .remove([attachment.storage_path]);

        if (storageError) throw storageError;

        const { error } = await supabase
            .from("calendar_event_attachments")
            .delete()
            .eq("id", id);

        if (error) throw error;

        await loadEvents();
        renderAll();

        if (selectedEventId) {
            await renderDetail(selectedEventId);
        }

        showToast("La imagen se eliminó correctamente.", "info");

    } catch (error) {

        console.error("Error al eliminar imagen:", error);

        showToast(getFriendlyErrorMessage(error), "error");
    }
}

    /* ======================================
       ELIMINAR EVENTOS
    ====================================== */

    async function deleteEvent(id) {

        if (!canDeleteEvents()) return;

        const event = events.find(item => item.id === id);

        if (!event) return;

        const confirmed = await calConfirm({
            title: "¿Eliminar este evento?",
            message: `"${event.title}" se borra definitivamente del calendario, junto con sus imágenes.`,
            confirmText: "Eliminar",
            tone: "danger"
        });

        if (!confirmed) return;

        try {

            const paths = event.attachments.map(item => item.storage_path);

            if (paths.length) {
                const { error: storageError } = await supabase.storage
                    .from(BUCKET)
                    .remove(paths);

                if (storageError) throw storageError;
            }

            const { error } = await supabase
                .from("calendar_events")
                .delete()
                .eq("id", id);

            if (error) throw error;

            selectedEventId = null;

            await loadEvents();
            renderAll();

showToast(event.title, "deleted");

        } catch (error) {
            console.error(error);
            alert("No se pudo eliminar el evento.");
        }
    }


    /* ======================================
       NAVEGACIÓN ENTRE MESES
    ====================================== */

    function changePeriod(direction) {

        if (currentView === "week") {

            selectedDate.setDate(
                selectedDate.getDate() + (direction * 7)
            );

            currentDate = new Date(selectedDate);

        } else {

            currentDate = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + direction,
                1
            );

            selectedDate = new Date(currentDate);
        }

        renderAll();
    }


   function setView(view) {
    currentView = view;

    $$(".cal-views button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === view
        );
    });

    renderCalendar();
}


    /* ======================================
       EVENTOS DE INTERFAZ
    ====================================== */

    function attachListeners() {

        $("#calNotificationsButton").addEventListener("click", async () => {
    const panel = $("#calNotificationsPanel");
    const button = $("#calNotificationsButton");

    panel.hidden = !panel.hidden;

    button.setAttribute(
        "aria-expanded",
        String(!panel.hidden)
    );

    if (!panel.hidden) {
        await loadNotifications();
    }
});



$("#calNotificationsList").addEventListener("click", async event => {

    const completeButton = event.target.closest("[data-notification-complete]");
    const editButton = event.target.closest("[data-notification-edit]");
    const openButton = event.target.closest("[data-notification-event]");

    if (!completeButton && !editButton && !openButton) return;

    const notificationId =
        completeButton?.dataset.notificationComplete ||
        editButton?.dataset.notificationEdit ||
        openButton?.dataset.notificationId;

    const notification = eventNotifications.find(
        item => String(item.id) === String(notificationId)
    );

    if (!notification) return;

    const calendarEvent = events.find(
        item => item.id === notification.event_id
    );

    if (!calendarEvent) {
        showToast("No se encontró el evento asociado.", "error");
        return;
    }

    const clickedButton = completeButton || editButton || openButton;

    clickedButton.disabled = true;

    try {

        // ACCIÓN 1: MARCAR COMO COMPLETADO

        if (completeButton) {

            if (calendarEvent.created_by !== user.id) {
                throw new Error(
                    "Solo el creador puede completar este evento."
                );
            }

            if (calendarEvent.status !== "en_progreso") {
                throw new Error(
                    "El evento ya no está en progreso."
                );
            }

            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from("calendar_events")
                .update({
                    status: "completado",
                    updated_by: user.id
                })
                .eq("id", calendarEvent.id)
                .eq("created_by", user.id)
                .select("id")
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                throw new Error(
                    "No se pudo actualizar el evento. Verificá tus permisos."
                );
            }

            const { error: notificationError } = await supabase
                .from("calendar_event_notifications")
                .update({
                    seen_at: notification.seen_at || now,
                    resolved_at: now
                })
                .eq("id", notification.id)
                .eq("recipient_id", user.id)
                .is("resolved_at", null);

            if (notificationError) {
                console.error(
                    "El evento se completó, pero no se pudo cerrar el aviso:",
                    notificationError
                );
            }

            calendarEvent.status = "completado";

            renderAll();
            await renderDetail(calendarEvent.id);
            await loadNotifications();

            showToast("Evento marcado como completado.", "success");
            return;
        }

        // ACCIÓN 2: MARCAR COMO LEÍDA Y ABRIR EDICIÓN

        if (!notification.seen_at) {

            const { error } = await supabase
                .from("calendar_event_notifications")
                .update({
                    seen_at: new Date().toISOString()
                })
                .eq("id", notification.id)
                .eq("recipient_id", user.id)
                .is("resolved_at", null);

            if (error) throw error;
        }

        await loadNotifications();

        $("#calNotificationsPanel").hidden = true;

        $("#calNotificationsButton").setAttribute(
            "aria-expanded",
            "false"
        );

        openModal(calendarEvent);

    } catch (error) {

        console.error("Error al procesar la notificación:", error);

        showToast(
            error.message || "No se pudo completar la operación.",
            "error"
        );

        await loadNotifications();

    } finally {
        clickedButton.disabled = false;
    }

});



        $("#calNewEvent").addEventListener("click", () => {
            openModal();
        });

        /* IMPORTAR ARCHIVO EXCEL */

$("#calImportExcel").addEventListener("click", () => {

    $("#calImportExcelFile").value = "";

    $("#calImportExcelFile").click();
});


$("#calImportExcelFile").addEventListener("change", async event => {

    const file = event.target.files?.[0];

    if (file) {
        await handleCalendarExcelFile(file);
    }

});


/* BOTÓN IMPORTAR EVENTOS */

$("#calImportConfirm").addEventListener(
    "click",
    importCalendarEvents
);

/* CERRAR VENTANA DE IMPORTACIÓN */

$("#calImportModal").addEventListener("click", event => {

    if (event.target.closest("[data-close-import]")) {
        $("#calImportModal").hidden = true;
    }

});


/* EDITAR LOS DATOS DE LA VISTA PREVIA */

$("#calImportPreview").addEventListener(
    "change",
    handleImportPreviewChange
);

// Actualizar descripciones mientras se escribe.
$("#calImportPreview").addEventListener(
    "input",
    handleImportPreviewInput
);

// Marcas, filtros, eliminación y acciones masivas.
$("#calImportPreview").addEventListener(
    "click",
    handleImportPreviewClick
);

        $("#calPrevMonth").addEventListener("click", () => {
            changePeriod(-1);
        });

        $("#calNextMonth").addEventListener("click", () => {
            changePeriod(1);
        });

        $("#calClearFilters").addEventListener("click", clearFilters);

        $("#calFilterResponsible").addEventListener("change", renderAll);

        $("#calViewAllEvents").addEventListener("click", () => {
            setView("list");
        });

        $$(".cal-views button").forEach(button => {
            button.addEventListener("click", () => {
                setView(button.dataset.view);
            });
        });

        root.addEventListener("change", event => {

            handleMultiFilter(event, "data-brand-option");
            handleMultiFilter(event, "data-category-option");
            handleMultiFilter(event, "data-branch-option");

            if (event.target.id === "calEventBrandScope") {
                $("#calEventBrands").hidden =
                    event.target.value !== "selected";
            }

            if (event.target.id === "calEventBranchScope") {
                $("#calEventBranches").hidden =
                    event.target.value !== "selected";
            }

            if (event.target.id === "calEventCategory") {
                toggleLaunchField();
            }
        });


        $("#calEventForm").addEventListener(
            "submit",
            handleFormSubmit
        );


/* ABRIR EDITOR AUTOMÁTICAMENTE AL ELEGIR IMÁGENES */

$("#calEventImages").addEventListener("change", event => {
    const files = event.target.files;

    if (files && files.length) {
        openCropEditor(files);
    }
});

/* CONTROLES DEL EDITOR */

$("#calCropClose").addEventListener("click", () => {
    closeCropEditor();
});

$("#calCropCancel").addEventListener("click", () => {
    closeCropEditor();
});

$("#calCropConfirm").addEventListener("click", confirmCrop);

$("#calCropPrevious").addEventListener("click", previousCrop);

$("#calCropZoom").addEventListener("input", event => {
    handleCropZoom(event.target.value);
});

$("#calCropAspect").addEventListener("change", () => {
    cropOffsetX = 0;
    cropOffsetY = 0;
    updateCropCanvas();
});

/* MOVIMIENTO CON MOUSE O PANTALLA TÁCTIL */

const cropCanvas = $("#calCropCanvas");

cropCanvas.addEventListener("pointerdown", startCropDrag);
cropCanvas.addEventListener("pointermove", moveCropDrag);
cropCanvas.addEventListener("pointerup", stopCropDrag);
cropCanvas.addEventListener("pointercancel", stopCropDrag);

/* CERRAR AL HACER CLIC FUERA DEL EDITOR */

$("#calCropModal").querySelector(".cal-crop-backdrop")
    .addEventListener("click", () => {
        closeCropEditor();
    });

        $("#calEventModal").addEventListener("click", event => {

            if (event.target.matches("[data-close-modal]")) {
                closeModal();
            }
        });


        const calendarGrid = $("#calendarGrid");

// Limpiar efectos visuales del arrastre.
function clearCalendarDragStyles() {
    clearRangePreview();
    $$(".cal-day.is-drop-target").forEach(day => {
        day.classList.remove("is-drop-target");
        day.style.removeProperty("outline");
        day.style.removeProperty("outline-offset");
        day.style.removeProperty("background-color");
    });

    $$(".cal-event-chip.is-dragging").forEach(chip => {
        chip.classList.remove("is-dragging");
        chip.style.removeProperty("opacity");
    });
}

// INICIO DEL ARRASTRE
/* ======================================
   ARRASTRE EN VIVO (mouse o dedo)
   - Arrastrar la barra: mueve el evento completo.
   - Agarradera izquierda: cambia solo el inicio.
   - Agarradera derecha: cambia solo el fin.
   La barra se redibuja mientras se arrastra. Si no se
   arrastró (fue un clic), se abre la ficha del evento.
====================================== */

const DRAG_THRESHOLD = 5;

function setEventPreviewDates(calendarEvent, startKey, endKey) {
    calendarEvent.start_at = `${startKey}T12:00:00`;
    calendarEvent.end_at = `${endKey}T12:00:00`;
}

function finishLiveDrag() {
    document.documentElement.classList.remove("cal-is-resizing", "cal-is-moving");
    clearRangePreview();
}

calendarGrid.addEventListener("pointerdown", event => {

    if (event.button !== 0 || !canManage()) return;

    const chip = event.target.closest(".cal-event-chip[data-event-id]");
    if (!chip) return;

    const calendarEvent = events.find(item => item.id === chip.dataset.eventId);
    if (!calendarEvent) return;

    const handle = event.target.closest(".cal-resize-handle");

    const start = inputDate(calendarEvent.start_at);
    const end = calendarEvent.end_at ? inputDate(calendarEvent.end_at) : start;

    resizeState = {
        id: calendarEvent.id,
        event: calendarEvent,
        mode: handle ? handle.dataset.edge : "move",
        start,
        end,
        anchorDate: chip.dataset.eventDate,
        originalStartAt: calendarEvent.start_at,
        originalEndAt: calendarEvent.end_at,
        newStart: start,
        newEnd: end,
        x: event.clientX,
        y: event.clientY,
        active: false
    };

    // En las agarraderas el arrastre empieza enseguida.
    if (handle) {
        event.preventDefault();
        resizeState.active = true;
        document.documentElement.classList.add("cal-is-resizing");
    }
});

document.addEventListener("pointermove", event => {

    if (!resizeState) return;

    const state = resizeState;

    if (!state.active) {
        const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y);
        if (distance < DRAG_THRESHOLD) return;

        state.active = true;
        document.documentElement.classList.add("cal-is-moving");
        closeDayEventsPopover();
    }

    event.preventDefault();

    const day = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest(".cal-day[data-date]");

    if (!day || !calendarGrid.contains(day)) return;

    const target = day.dataset.date;

    let newStart = state.start;
    let newEnd = state.end;

    if (state.mode === "start") {
        newStart = target > state.end ? state.end : target;
    } else if (state.mode === "end") {
        newEnd = target < state.start ? state.start : target;
    } else {
        const delta = calendarDayOffset(state.anchorDate, target);
        newStart = shiftCalendarDate(state.start, delta);
        newEnd = shiftCalendarDate(state.end, delta);
    }

    if (newStart === state.newStart && newEnd === state.newEnd) return;

    state.newStart = newStart;
    state.newEnd = newEnd;

    // Redibujar el calendario con las fechas provisorias.
    setEventPreviewDates(state.event, newStart, newEnd);
    renderCalendar();

    $$(`.cal-event-chip[data-event-id="${CSS.escape(state.id)}"]`)
        .forEach(item => item.classList.add("is-live-dragging"));

    const days = calendarDayOffset(newStart, newEnd) + 1;
    const daysLabel = `${days} ${days === 1 ? "día" : "días"}`;

    const label = state.mode === "start"
        ? `Inicio: ${formatShortDate(newStart)} · ${daysLabel}`
        : state.mode === "end"
            ? `Fin: ${formatShortDate(newEnd)} · ${daysLabel}`
            : newStart === newEnd
                ? formatShortDate(newStart)
                : `${formatShortDate(newStart)} → ${formatShortDate(newEnd)}`;

    const anchor = calendarGrid.querySelector(`.cal-day[data-date="${target}"]`) || day;
    showRangeTip(anchor, label);
});

async function endLiveDrag(cancelled) {

    if (!resizeState) return;

    const state = resizeState;
    resizeState = null;

    if (!state.active) return; // fue un clic: lo maneja el evento "click"

    finishLiveDrag();

    // Que el clic que sigue al soltar no abra la ficha.
    ignoreCalendarClickUntil = Date.now() + 600;

    // Volver a las fechas reales antes de guardar.
    state.event.start_at = state.originalStartAt;
    state.event.end_at = state.originalEndAt;

    const changed = state.newStart !== state.start || state.newEnd !== state.end;

    if (cancelled || !changed) {
        renderCalendar();
        return;
    }

    await moveCalendarEvent(state.id, state.newStart, state.newEnd, "set");
}

document.addEventListener("pointerup", () => endLiveDrag(false));
document.addEventListener("pointercancel", () => endLiveDrag(true));

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && resizeState?.active) {
        endLiveDrag(true);
    }
});

calendarGrid.addEventListener("dragstart", event => {

    // Si se agarró un tirador, se estira con el mouse (no se mueve).
    if (resizeState || event.target.closest?.(".cal-resize-handle")) {
        event.preventDefault();
        return;
    }

    const chip = event.target.closest(".cal-event-chip[data-event-id]");

    if (!chip || !canManage()) {
        event.preventDefault();
        return;
    }

    const sourceDate = chip.dataset.eventDate ||
        chip.closest(".cal-day[data-date]")?.dataset.date;

    if (!sourceDate) {
        event.preventDefault();
        return;
    }

    draggedCalendarEvent = {
        id: chip.dataset.eventId,
        sourceDate,
        mode: "move"
    };

    calendarDragEdge = null;

calendarDragInProgress = true;
    chip.classList.add("is-dragging");
    chip.style.opacity = "0.45";

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", chip.dataset.eventId);
    }
});

// PERMITIR SOLTAR SOBRE UN DÍA
calendarGrid.addEventListener("dragover", event => {
    if (!draggedCalendarEvent || !canManage()) return;

    const day = event.target.closest(".cal-day[data-date]");
    if (!day) return;

    event.preventDefault();

    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }

    // Vista previa: marcar los días donde quedaría el evento.
    const moving = events.find(item => item.id === draggedCalendarEvent.id);

    if (moving) {
        const start = inputDate(moving.start_at);
        const end = moving.end_at ? inputDate(moving.end_at) : start;
        const delta = calendarDayOffset(
            draggedCalendarEvent.sourceDate,
            day.dataset.date
        );
        const newStart = shiftCalendarDate(start, delta);
        const newEnd = shiftCalendarDate(end, delta);

        showRangePreview(
            newStart,
            newEnd,
            day,
            newStart === newEnd
                ? formatShortDate(newStart)
                : `${formatShortDate(newStart)} → ${formatShortDate(newEnd)}`
        );
    }
});

// LIMPIAR RESALTADO AL SALIR DEL DÍA
calendarGrid.addEventListener("dragleave", event => {
    const day = event.target.closest(".cal-day[data-date]");
    if (!day) return;

    if (event.relatedTarget && day.contains(event.relatedTarget)) {
        return;
    }

    day.classList.remove("is-drop-target");
    day.style.removeProperty("outline");
    day.style.removeProperty("outline-offset");
    day.style.removeProperty("background-color");
});

// SOLTAR EL EVENTO EN EL NUEVO DÍA
calendarGrid.addEventListener("drop", async event => {
    if (!draggedCalendarEvent || !canManage()) return;

    const day = event.target.closest(".cal-day[data-date]");
    if (!day) return;

    event.preventDefault();

    const dragged = draggedCalendarEvent;
    const targetDate = day.dataset.date;

    draggedCalendarEvent = null;
    clearCalendarDragStyles();

    if (dragged.sourceDate === targetDate) return;

    // Evitar que el clic posterior abra el detalle del evento.
    ignoreCalendarClickUntil = Date.now() + 500;

    await moveCalendarEvent(
        dragged.id,
        dragged.sourceDate,
        targetDate,
        dragged.mode
    );
});

// FINALIZAR ARRASTRE
calendarGrid.addEventListener("dragend", () => {

    if (calendarDragInProgress) {
        ignoreCalendarClickUntil = Date.now() + 1500;
    }

    calendarDragInProgress = false;
    draggedCalendarEvent = null;

    clearCalendarDragStyles();
});

// Evitar que el clic posterior al arrastre abra el detalle.
calendarGrid.addEventListener("click", event => {

    if (Date.now() < ignoreCalendarClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

}, true);

// RESALTAR TODA LA BARRA (todos los días) AL PASAR EL MOUSE
calendarGrid.addEventListener("mouseover", event => {
    const chip = event.target.closest(".cal-event-chip[data-event-id]");
    const id = chip?.dataset.eventId;

    $$(".cal-event-chip.is-hover").forEach(item => {
        if (item.dataset.eventId !== id) item.classList.remove("is-hover");
    });

    if (id) {
        $$(`.cal-event-chip[data-event-id="${CSS.escape(id)}"]`)
            .forEach(item => item.classList.add("is-hover"));
    }
});

calendarGrid.addEventListener("mouseleave", () => {
    $$(".cal-event-chip.is-hover").forEach(item =>
        item.classList.remove("is-hover")
    );
});

// PERSONALIZAR COLORES
root.addEventListener("click", event => {
    const button = event.target.closest("[data-edit-colors]");
    if (!button) return;

    if (document.querySelector(".cal-colors-panel")) {
        closeColorsPanel();
    } else {
        openColorsPanel(button);
    }
});

// CONSERVAR EL CLIC NORMAL PARA ABRIR LOS DETALLES
calendarGrid.addEventListener("click", event => {

    if (Date.now() < ignoreCalendarClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    // "+N más": mostrar todos los eventos del día.
    const moreButton = event.target.closest("[data-more-date]");

    if (moreButton) {
        event.stopPropagation();
        openDayEventsPopover(moreButton);
        return;
    }

    const eventButton = event.target.closest("[data-event-id]");

    if (eventButton) {
        event.stopPropagation();

        selectEvent(eventButton.dataset.eventId);
        return;
    }

    const day = event.target.closest("[data-date]");

    if (day) {
        selectedDate = new Date(`${day.dataset.date}T00:00:00`);
        currentDate = new Date(selectedDate);
        renderCalendar();
    }
});


        $("#calUpcomingEvents").addEventListener("click", event => {

            const item = event.target.closest("[data-event-id]");

            if (item) selectEvent(item.dataset.eventId);
        });


        $("#calEventDetail").addEventListener("click", event => {

            const edit = event.target.closest("[data-edit-event]");

            if (edit) {
                const item = events.find(
                    event => event.id === edit.dataset.editEvent
                );

                if (item) openModal(item);
                return;
            }

            const removeEvent = event.target.closest("[data-delete-event]");

            if (removeEvent) {
                deleteEvent(removeEvent.dataset.deleteEvent);
                return;
            }

            const removeAttachment =
                event.target.closest("[data-delete-attachment]");

            if (removeAttachment) {
                deleteAttachment(
                    removeAttachment.dataset.deleteAttachment
                );
            }
        });

        /* CERRAR VENTANA DE DETALLE */

$("#calEventDetailModal").addEventListener("click", event => {

    if (event.target.closest("[data-close-detail-modal]")) {
        $("#calEventDetailModal").hidden = true;
    }

});


/* ACCIONES DENTRO DEL DETALLE EMERGENTE */

$("#calEventDetailModalBody").addEventListener("click", event => {

    const edit = event.target.closest("[data-edit-event]");

    if (edit) {
        const item = events.find(
            event => event.id === edit.dataset.editEvent
        );

        if (item) {
            $("#calEventDetailModal").hidden = true;
            openModal(item);
        }

        return;
    }

    const removeEvent = event.target.closest("[data-delete-event]");

    if (removeEvent) {
        $("#calEventDetailModal").hidden = true;
        deleteEvent(removeEvent.dataset.deleteEvent);
        return;
    }

    const removeAttachment =
        event.target.closest("[data-delete-attachment]");

    if (removeAttachment) {
        deleteAttachment(
            removeAttachment.dataset.deleteAttachment
        );
    }

});

        $("#calShowNextMonths").addEventListener("click", () => {

            const container = $("#calFutureMonths");

            container.hidden = !container.hidden;

            $("#calShowNextMonths").textContent = container.hidden
                ? "↓ Mostrar próximos meses"
                : "↑ Ocultar próximos meses";

            if (!container.hidden) {
                renderFutureMonths();
            }
        });


        $("#calFutureMonths").addEventListener("click", event => {

            const button = event.target.closest("[data-go-month]");

            if (!button) return;

            const [year, month] = button.dataset.goMonth
                .split("-")
                .map(Number);

            currentDate = new Date(year, month - 1, 1);
            selectedDate = new Date(currentDate);

            setView("month");

            $("#calendarGrid").scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        });
    }


    function selectEvent(id) {

        selectedEventId = id;

        const event = events.find(item => item.id === id);

        if (!event) return;

        currentDate = dateFromISO(event.start_at);
        selectedDate = new Date(currentDate);

        renderCalendar();
        renderDetail(id);
    }


    /* ======================================
       REGISTRO PARA EL ROUTER SPA
    ====================================== */

    window.FENIX_VIEWS = window.FENIX_VIEWS || {};

    window.FENIX_VIEWS.calendar = initializeCalendar;

})();

