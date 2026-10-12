// ========================================
// SIDEBAR PLEGABLE
// ========================================

const appLayout = document.querySelector(".app-layout");
const sidebarToggle = document.getElementById("sidebarToggle");

if (appLayout && sidebarToggle) {

    // Recuperar preferencia guardada
    const sidebarState = localStorage.getItem("sidebarState");

    if (sidebarState === "collapsed") {
        appLayout.classList.add("sidebar-collapsed");
    }


    // Abrir / cerrar sidebar
    sidebarToggle.addEventListener("click", function () {

        appLayout.classList.toggle("sidebar-collapsed");

        const collapsed = appLayout.classList.contains("sidebar-collapsed");

        localStorage.setItem(
            "sidebarState",
            collapsed ? "collapsed" : "expanded"
        );
    });
}