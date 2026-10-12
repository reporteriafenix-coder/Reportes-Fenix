function login() {
    const user = document.getElementById('usuario').value.trim();
    const pass = document.getElementById('password').value.trim();

    const encontrado = usuarios.find(
        u => u.usuario === user && u.password === pass
    );

    if (encontrado) {
        localStorage.setItem('usuario', encontrado.usuario);
        localStorage.setItem('rol', encontrado.rol);

        switch (encontrado.rol) {
            case 'admin':
                window.location.href = 'index.html';
                break;

            case 'Gerencia':
                window.location.href = 'index.html';
                break;

            case 'B2B':
                window.location.href = 'B2B.html';
                break;

            case 'B2C':
                window.location.href = 'B2C.html';
                break;

            case 'batas':
                window.location.href = 'BATAS.html';
                break;

            case 'ecom':
                window.location.href = 'ECOM.html';
                break;

            case 'Tiendamcal':
                window.location.href = 'MariscalLopez.html';
                break;

            case 'Tiendaestrella':
                window.location.href = 'Estrella.html';
                break;

            case 'Tiendacerro':
                window.location.href = 'CerroAlto.html';
                break;

            case 'Tiendagaleria':
                window.location.href = 'Galeria.html';
                break;

            case 'Tiendapaseo':
                window.location.href = 'PaseoLambare.html';
                break;

            case 'Tiendamariano':
                window.location.href = 'ShoppingMariano.html';
                break;

            case 'Tiendasmariscal':
                window.location.href = 'ShoppingMariscalLopez.html';
                break;

            case 'Tiendapinedo':
                window.location.href = 'ShoppingPinedo.html';
                break;

            case 'Tiendasanlo':
                window.location.href = 'ShoppingSanLorenzo.html';
                break;

            case 'Tiendaluque':
                window.location.href = 'TOLuque.html';
                break;

            case 'Tiendasur':
                window.location.href = 'TOSur.html';
                break;

            case 'Tiendamsanlo':
                window.location.href = 'MartelSanLorenzo.html';
                break;
        }

    } else {
        document.getElementById('error').innerText =
            'Usuario o contraseña incorrectos';
    }
}