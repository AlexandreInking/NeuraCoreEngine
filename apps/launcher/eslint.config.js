import eslint from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      globals: {
        document: 'readonly',
        HTMLDivElement: 'readonly',
        fetch: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLElement: 'readonly',
        window: 'readonly',
        ResizeObserver: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        PointerEvent: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        SVGSVGElement: 'readonly',
        XMLSerializer: 'readonly',
        Image: 'readonly',
        TextDecoder: 'readonly',
        getComputedStyle: 'readonly',
        AudioContext: 'readonly',
        AnalyserNode: 'readonly',
        MediaStream: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestAnimationFrame: 'readonly',
        performance: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': typescriptEslint },
    rules: typescriptEslint.configs.recommended.rules,
  },
  prettier,
  { ignores: ['dist', 'src-tauri/target'] },
];
