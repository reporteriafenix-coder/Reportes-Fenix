// ========================================
// AUTENTICACIÓN Y PERMISOS
// ========================================

const rol = localStorage.getItem("rol");
const usuario = localStorage.getItem("usuario");

const pagina = window.location.pathname.split("/").pop() || "index.html";


// Si no existe sesión, volver al login
if (!rol) {
    window.location.href = "acceso-sistema.html";
}


// Permisos actuales
// TEMPORAL: posteriormente los reemplazaremos
// por el sistema definitivo de perfiles.
const permisos = {

    admin: [
        "index.html",
        "B2B.html",
        "B2C.html",
        "BATAS.html",
        "ECOM.html",
        "MariscalLopez.html",
        "ShoppingMariscalLopez.html",
        "ShoppingPinedo.html",
        "ShoppingMariano.html",
        "ShoppingSanLorenzo.html",
        "Galeria.html",
        "CerroAlto.html",
        "Estrella.html",
        "TOSur.html",
        "TOLuque.html",
        "PaseoLambare.html",
        "Tiendas_prueba.html",
        "MartelSanLorenzo.html",
            'Inventario.html'
    ],

    GERENCIA: [
        "index.html",
        "B2B.html",
        "B2C.html",
        "BATAS.html",
        "ECOM.html",
        "Tiendas_retail.html",
        "Tiendas_prueba.html"
    ],

    B2B: [
        "B2B.html"
    ],

    B2C: [
        "B2C.html",
        "Tiendas_prueba.html"
    ],

    batas: [
        "BATAS.html"
    ],

    ecom: [
        "ECOM.html"
    ],

    tienda_retail: [
        "Tiendas_prueba.html"
    ],

    Tiendamcal: [
        "MariscalLopez.html"
    ]
};


// Verificar permiso de acceso
const paginasPermitidas = permisos[rol] || [];

if (!paginasPermitidas.includes(pagina)) {

    alert("No tienes permiso para acceder a esta página");

    window.location.href = "acceso-sistema.html";
}