export type ChangelogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v0.3.0-alpha',
    date: '2026-08-05',
    notes: [
      'Hito 3.1-3.5: índice de hechos atómicos L1 local-first con semántica Qdrant — `LocalL1Store` (facts SPO vectorizados, búsqueda cosine Top-K con decay temporal `cos·e^(−λ·Δt)`, λ configurable 0.01-0.5).',
      'Embeddings 100% locales en el webview: `@huggingface/transformers` + `all-MiniLM-L6-v2` (384 dims, ONNX, descarga única). Sin Docker, sin Ollama, sin API externa.',
      'Extractor SPO: prompt LLM (DeepSeek configurado) con fallback heurístico local, tripletas editables y filtro de certeza ≥ 75%.',
      'Worker auto-extracción L0 → L1: cada N=5 entradas nuevas del buffer procesa un batch (polling local en lugar de `XREAD BLOCK`), badge de pendientes y log de extracción.',
      'Panel Memory > L1 Atomic Facts Index: generador de embeddings con preview del vector, extracción/indexación de tripletas, búsqueda semántica con λ slider y estado del modelo.',
    ],
  },
  {
    version: 'v0.1.0-alpha',
    date: '2026-08-03',
    notes: [
      'Launcher desktop nativo con onboarding persistente.',
      'Tema claro/oscuro, navegación principal y consola de eventos Rust.',
      'Base de auto-updater firmado preparada para GitHub Releases.',
      'Multi-chat: crea y guarda conversaciones separadas localmente.',
      'Panel cognitivo compartido con resumen gráfico de personalidad, moralidad, emociones, consciencia, subconsciente y capas de memoria L0–L3.',
      'Conexión DeepSeek desde Settings: API key, base URL y modelo configurables con test de conexión.',
      'Motor cognitivo local: personalidad HEXACO dual (consciente/subconsciente), emociones Plutchik + VAD, moralidad, introspección y memoria con olvido (Ebbinghaus), represión y sueños.',
      'Modelo por defecto: deepseek-v4-flash-0731.',
      'Página Memory: unidades de memoria, fuerza de retención, recuerdos reprimidos y ciclos de sueño.',
      'Psicología profunda: arquetipos jungianos, sombra, mecanismos de defensa, jerarquía de Maslow, apego, marcadores somáticos, emociones de Ekman, inteligencia emocional y alineación corazón-mente.',
      'Página Affect Engine: aura emocional, VAD, rueda de Plutchik, simulador de estímulos y decaimiento.',
      'Dashboard con snapshot cognitivo en vivo y memoria de trabajo (7±2) en la página Memory.',
      'Chat como escritorio de ventanas: conversación, panel cognitivo y artefactos (gráficos, código, notas, tablas, diagramas) movibles, redimensionables y minimizables.',
      'Artefactos del agente: bloques ```chart / ```code / ```note / ```table / ```mermaid se abren en ventanas separadas con chips enlazados en el mensaje.',
      'Corrección de layout: la barra lateral ya no se corta y el contenido principal evita el desbordamiento horizontal.',
      'Canvas de chat desplazable: las ventanas pueden colocarse fuera de la vista y el escritorio se mueve con scroll o arrastre con botón central.',
      'Mensajes humanizados: revelado con máquina de escribir (~256 PPM) y guía al modelo para mensajes mayormente cortos con emojis solo en el 2-5%.',
      'Memoria: grafo de conexiones (tamaño = importancia, color = emoción), búsqueda semántica local, inserción de memorias y edición por capas (debilitar, reprimir, eliminar).',
      'Corrección: el canvas de chat ya no desborda la interfaz; la altura queda bloqueada al viewport con scroll interno y al cambiar de chat la vista vuelve a la ventana de conversación.',
      'Canvas infinito sin barras de desplazamiento: gestor de ventanas (taskbar con todas las ventanas), botón "Center all", doble clic en el título para centrar y modo Pan.',
      'Barras de desplazamiento ocultas en toda la app (el scroll sigue funcionando).',
      'Hito 2.1-2.5: buffer L0 local-first con semántica Redis Streams — buffer circular MAXLEN configurable, TTL por sesión, feed en vivo con polling 1s, prosodia simulada (Pitch/Energy/Speech Rate) con auto-sim 500ms, exportación JSON y cierre de sesiones con resumen.',
      'El chat escribe automáticamente cada mensaje (usuario y agente) al buffer L0 de la sesión.',
    ],
  },
];
