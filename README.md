# Neura-Core Engine

Neura-Core se distribuye como una aplicación de escritorio descargable. La interfaz usa React dentro de la ventana nativa de Tauri; no es una webapp ni requiere desplegar un servidor web.

## Privacidad

Neura-Core no incluye trackers, analytics, píxeles, SDKs publicitarios ni telemetría remota. Los eventos y configuraciones permanecen locales, salvo que una integración externa sea activada explícitamente por el usuario.

La referencia audiovisual usada para orientar el diseño está en [External Inputs/YouTube](External%20Inputs/YouTube/).

## Motor cognitivo local

Desde la versión alpha, el launcher ejecuta un motor cognitivo **local-first** (TypeScript, sin servidores ni Docker) inspirado en el documento de diseño NetNavi Superinteligente:

- **Personalidad dual** HEXACO consciente/subconsciente con alineamiento moral y conflicto interno.
- **Psicología profunda**: arquetipos jungianos (persona, sombra, anima/animus, self), perfil de sombra, mecanismos de defensa (Freud), jerarquía de necesidades (Maslow), estilo de apego (Ainsworth) y autoeficacia (Bandura).
- **Emociones** Plutchik + VAD con transición e inercia según la especificación, emociones de Ekman, contagio emocional (Hatfield), inteligencia emocional (Goleman), marcadores somáticos (Damasio) y alineación corazón-mente (Kahneman/Haidt).
- **Memoria** con curva de olvido de Ebbinghaus, represión freudiana, memoria de trabajo 7±2, recuperación por relevancia psicológica y reconsolidación.
- **Sueños**: ciclo de consolidación que fortalece memorias, resuelve conflictos y genera insights.
- **Introspección** y compilación de un System Prompt en carácter para el modelo conectado.

Todo el estado persiste en `localStorage` del launcher (clave por agente). El modelo por defecto es `deepseek-v4-flash-0731`, configurable en Settings. El mundo interior se refleja en el Dashboard, el panel cognitivo de Chats, la página Affect Engine y la página Memory.

## Chat como escritorio de ventanas

La pestaña Chats es un escritorio donde la conversación, el panel cognitivo y los artefactos del agente viven en ventanas independientes movibles, redimensionables, minimizables y cerrables. Cuando el modelo responde con bloques ```` ```chart ````, ```` ```code ````, ```` ```note ````, ```` ```table ```` o ```` ```mermaid ````, cada bloque se abre en su propia ventana (gráficos SVG, código con botón de copiado, notas, tablas y diagramas); el mensaje conserva un chip que enfoca la ventana. Las posiciones persisten por conversación en `localStorage`.

El canvas es un escritorio de ventanas: las ventanas pueden colocarse en cualquier punto y la vista se mueve con el modo Pan o el botón central del ratón. Los mensajes del agente se revelan con efecto máquina de escribir (~256 PPM) y el System Prompt le pide mensajes mayormente cortos con emojis solo cuando aportan (2-5%).

El canvas es ahora **infinito y sin barras de desplazamiento**: un gestor de ventanas (taskbar) lista todas las ventanas para encontrarlas y centrarlas, el botón "Center all" las agrupa en la vista, el doble clic en un título centra esa ventana, y el modo Pan (o botón central) mueve la vista. Los scrolls del resto de la app siguen funcionando pero están ocultos visualmente.

## Buffer L0 (hitos 2.1–2.5)

El buffer circular L0 está implementado **local-first** (`apps/launcher/src/l0/`) con semántica de Redis Streams: buffer circular `MAXLEN ~ N` configurable, TTL de 24h por sesión, feed en vivo con polling de 1s, prosodia simulada (Pitch/Energy/Speech Rate) con modo auto-simulación de 500ms, exportación a `prosodia_session_YYYYMMDD.json` y cierre de sesiones con resumen. Cada mensaje del chat (usuario y agente) se escribe automáticamente al buffer. La interfaz `L0Store` queda como seam para un futuro adaptador Redis cuando haya Docker.

## Índice L1 de hechos atómicos (hitos 3.1–3.5)

La capa L1 extrae **hechos atómicos SPO** (sujeto-predicado-objeto) de las entradas L0 y los indexa como vectores consultables (`apps/launcher/src/l1/`), local-first con semántica Qdrant: colección de facts con embeddings 384-d, búsqueda cosine Top-K=5 con **decay temporal** `score = cos · e^(−λ·Δt)` y λ configurable (0.01–0.5).

Los embeddings se generan **100% en el webview** con `@huggingface/transformers` + `all-MiniLM-L6-v2` (ONNX, descarga única, sin API externa ni Ollama). El **extractor SPO** usa el LLM configurado (DeepSeek) con fallback heurístico local, tripletas editables y filtro de certeza ≥ 75%. Un **worker de auto-extracción** procesa cada N=5 entradas nuevas del buffer L0 (polling local en lugar de `XREAD BLOCK`), con badge de pendientes y log. Todo vive en el panel *Memory > L1 Atomic Facts Index*. La interfaz `L1Store` queda como seam para un futuro adaptador Qdrant real.

## Memoria visual y editable

La página Memory muestra el **grafo de conexiones** de los recuerdos: el tamaño de cada nodo representa su importancia/fuerza y el color su emoción asociada (rueda de Plutchik), con aristas por temas compartidos. Incluye **búsqueda semántica** local (similitud de keywords + fuerza Ebbinghaus), **inserción** de memorias nuevas y **edición por capas**: *Decay* (olvido acelerado), *Repress* (mover al subconsciente) o *Delete* (eliminar de todas las capas, con confirmación).

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
