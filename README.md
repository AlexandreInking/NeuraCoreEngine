# Neura-Core Engine

Neura-Core se distribuye como una aplicación de escritorio descargable. La interfaz usa React dentro de la ventana nativa de Tauri; no es una webapp ni requiere desplegar un servidor web.

## Privacidad

Neura-Core no incluye trackers, analytics, píxeles, SDKs publicitarios ni telemetría remota. Los eventos y configuraciones permanecen locales, salvo que una integración externa sea activada explícitamente por el usuario.

La referencia audiovisual usada para orientar el diseño está en [External Inputs/YouTube](External%20Inputs/YouTube/).

## Actualizaciones firmadas

El launcher consulta GitHub Releases en producción y solo acepta artefactos cuya firma coincida con la clave pública incluida en `apps/launcher/src-tauri/tauri.conf.json`. El botón de actualización descarga e instala el bundle firmado; una firma inválida se rechaza.

Para generar artefactos de release, conserva la clave privada fuera del proyecto y define la ruta antes de compilar:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\neuracore-updater.key"
npm run tauri:build --prefix apps/launcher
```

El endpoint actual espera `latest.json` en `AlexandreInking/NeuraCoreEngine` (verificado en `apps/launcher/src-tauri/tauri.conf.json`). El primer release firmado debe publicarse en ese repositorio para que el banner de actualización lo detecte.

En Windows, el bundle MSI exige identificadores prerelease numéricos. Para una prueba alpha usa `v0.1.1-1` en GitHub Releases; `v0.1.1-alpha` no puede empaquetarse como MSI.

## Requisitos de desarrollo

- Node.js 18+
- Rust estable
- Tauri CLI v2, incluido como dependencia del launcher

## Desarrollo

Instalar dependencias:

```powershell
npm install --prefix apps/launcher
```

Abrir la aplicación de escritorio en modo desarrollo:

```powershell
npm run tauri:dev --prefix apps/launcher
```

Acceso directo desde el código, sin reinstalar y sin abrir navegador:

```powershell
npm run desktop
```

También puedes abrir `launch-neuracore.cmd` con doble clic. El script no instala dependencias: inicia directamente la ventana nativa Tauri desde el código actual.

El comando `npm run dev --prefix apps/launcher` solo inicia la interfaz Vite para desarrollo de la UI; no representa el producto final.

## Empaquetado descargable

Crear los instaladores nativos para el sistema operativo actual:

```powershell
npm run tauri:build --prefix apps/launcher
```

Los artefactos quedan en `apps/launcher/src-tauri/target/release/bundle/`. Tauri genera el formato disponible para el sistema de compilación, por ejemplo `.msi`/`.exe` en Windows, `.dmg` en macOS y `.AppImage`/`.deb` en Linux.

La aplicación instalada arranca como proceso de escritorio y no necesita abrir un navegador ni ejecutar un servidor web.

## Comprobaciones

```powershell
npm run build
npm run lint
npm run format:check
```

## Estructura

- `apps/launcher`: aplicación de escritorio Tauri y su UI React embebida.
- `core/engine`: núcleo Rust para los módulos futuros del motor.
- `docs`: documentación del proyecto.
- `roadmaps`: planes de versiones y hitos.
