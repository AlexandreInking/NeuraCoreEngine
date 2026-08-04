export type ChangelogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
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
    ],
  },
];
