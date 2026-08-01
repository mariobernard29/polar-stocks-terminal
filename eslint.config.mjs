import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'src/main/db/generated/**',
      // Utillaje de desarrollo, no código de la aplicación.
      '.claude/**',
      '.screenshots/**',
      'scripts/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Los datos de mercado llegan sin tipar desde APIs externas: se validan con
      // zod en el borde, nunca se propaga `any` hacia adentro.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  /**
   * Fronteras entre capas. Esta es la regla que sostiene la arquitectura:
   * el renderer nunca puede importar del main (donde viven las API keys),
   * y main nunca depende del renderer. Todo cruce pasa por `shared`.
   * Un import ilegal rompe el lint, no la revisión de código.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      // Sin este resolver el plugin no sabe convertir `../renderer/App` en un
      // archivo .tsx, no clasifica la dependencia y las políticas no se aplican
      // — falla en silencio, que es peor que fallar.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          // Dos proyectos a propósito: node (main/preload) y web (renderer)
          // tienen `lib` y `types` distintos — esa separación es la que impide
          // que el renderer vea las APIs de Node.
          project: ['tsconfig.node.json', 'tsconfig.web.json'],
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/include': ['src/**/*'],
      // El patrón identifica la carpeta raíz de cada capa; todo su árbol
      // pertenece al elemento. Ojo: `src/main/**/*` NO funciona en v7.
      'boundaries/elements': [
        { type: 'shared', pattern: 'src/shared' },
        { type: 'main', pattern: 'src/main' },
        { type: 'preload', pattern: 'src/preload' },
        { type: 'renderer', pattern: 'src/renderer' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message: '`{{file.type}}` no puede depender de `{{dependency.type}}`.',
          policies: [
            // Los paquetes de npm y los builtins de Node están siempre permitidos:
            // lo que se restringe aquí son las capas internas, no las externas.
            { allow: { to: { module: { origin: 'external' } } } },
            { allow: { to: { module: { origin: 'builtin' } } } },

            // `shared` es la capa base: no puede depender de nadie más.
            { from: { element: { type: 'shared' } }, allow: { to: { element: { type: 'shared' } } } },

            // `main` posee secretos, base de datos y red. Nunca toca el renderer.
            {
              from: { element: { type: 'main' } },
              allow: { to: { element: { types: { anyOf: ['main', 'shared'] } } } },
            },

            // `preload` es solo el puente: ni lógica de negocio ni UI.
            {
              from: { element: { type: 'preload' } },
              allow: { to: { element: { types: { anyOf: ['preload', 'shared'] } } } },
            },

            // `renderer` no puede alcanzar `main` — ahí viven las API keys.
            {
              from: { element: { type: 'renderer' } },
              allow: { to: { element: { types: { anyOf: ['renderer', 'shared'] } } } },
            },
          ],
        },
      ],
    },
  },

  /** Reglas específicas de React, solo en el renderer. */
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  /**
   * El renderer no puede alcanzar Node ni Electron directamente. Su única
   * superficie es `window.polar`, expuesta por el preload.
   */
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'El renderer solo habla por IPC: usa window.polar.' },
            { name: 'fs', message: 'Sin acceso a filesystem en el renderer.' },
            { name: 'node:fs', message: 'Sin acceso a filesystem en el renderer.' },
            { name: 'path', message: 'Sin acceso a path en el renderer.' },
            { name: 'node:path', message: 'Sin acceso a path en el renderer.' },
            { name: '@prisma/client', message: 'La base de datos vive solo en el main.' },
          ],
          patterns: [
            { group: ['node:*'], message: 'El renderer no tiene APIs de Node.' },
            { group: ['**/main/**'], message: 'El renderer no puede importar del proceso main.' },
          ],
        },
      ],
    },
  },

  /** Los tests pueden ser más laxos. */
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
)
