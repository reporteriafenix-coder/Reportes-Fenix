REPORTES FÉNIX — VERSIÓN PILOTO SPA
===================================

QUÉ CAMBIA
----------
- index.html pasa a ser el contenedor principal del portal.
- El menú lateral, el encabezado general, el cierre de sesión y la sesión de Supabase se cargan una sola vez.
- js/spa-router.js cambia el contenido central sin descargar otro documento HTML.
- Las vistas visitadas quedan en memoria. Los iframes de Power BI permanecen montados al cambiar de módulo y no se vuelven a crear al regresar a una vista ya visitada.
- js/b2c.js inicializa Resumen/AO y el desplegable de Tiendas dentro de la vista dinámica.
- Los roles se verifican al entrar al portal. El router aplica las rutas permitidas según el rol cargado en el token.

ROLES DEL PILOTO
----------------
admin_gerencia: Panel Integral, B2B, B2C, Enerbike, AO, Batas, ECOM, Inventario y reportes de tiendas.
b2b: Panel Integral, B2B e Inventario.
b2c: Panel Integral, B2C, Enerbike, AO, Inventario y reportes de tiendas.
ao: Panel Integral, vista AO e Inventario.

CÓMO PROBAR LOCALMENTE
----------------------
1. Extraer esta carpeta en una ubicación de trabajo independiente.
2. Abrirla en VS Code.
3. Iniciar Live Server desde index.html (no abrir el archivo con file://).
4. Iniciar sesión desde acceso-sistema.html con una cuenta piloto de Supabase.
5. Probar Panel Integral, B2B, B2C, AO, Enerbike, Batas e Inventario según los permisos del usuario.
6. Usar atrás/adelante del navegador: el router conserva la ruta mediante el fragmento de URL.

IMPORTANTE
----------
- Esta es una versión de prueba; probarla en local antes de copiar cambios a la carpeta conectada a Git.
- No contiene .git, usuarios.js ni copias de respaldo.
- supabase-client.js conserva únicamente la URL del proyecto y la Publishable Key, que es la clave pública prevista para cliente. Nunca agregar aquí una Secret Key ni service_role.
- GitHub Pages publica archivos estáticos. Los controles de navegación del navegador no sustituyen controles de acceso del lado del servidor. Los informes Power BI también deben tener un método de compartición apropiado para datos confidenciales.
- Los HTML de los módulos redirigen al shell index.html si se abren directamente; el router los descarga como plantillas y extrae su contenido.
- Calendario.html y borrador_tiendas.html se conservan como archivos auxiliares fuera del menú SPA actual.

NOTA SOBRE AUTENTICACIÓN
------------------------
- El shell usa js/spa-auth.js para comprobar la sesión y recuperar el rol una sola vez al entrar.
- El archivo js/auth.js anterior ya no se carga en esta versión SPA; se conserva fuera de este paquete en el ZIP original que compartiste.
