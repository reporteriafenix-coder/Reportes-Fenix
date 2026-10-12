// Restaurar el estado del menú antes de mostrar su contenido
(function () {
    const sidebarState = localStorage.getItem("sidebarState");

    if (sidebarState !== "collapsed") {
        return;
    }

    const appLayout = document.querySelector(".app-layout");

    if (appLayout) {
        appLayout.classList.add("sidebar-collapsed");
    }
})();