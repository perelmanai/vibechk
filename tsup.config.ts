import { defineConfig } from 'tsup'

const externalPackages = [
  'chalk',
  'boxen',
  'ora',
  'commander',
  '@inquirer/prompts',
  'inquirer',
  'open',
  'uuid',
  'dayjs',
  'proper-lockfile',
]

export default defineConfig([
  // Library: ESM + CJS, external deps
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    platform: 'node',
    target: 'node18',
    outDir: 'dist',
    splitting: false,
    external: externalPackages,
  },
  // CLI: ESM (avoids CJS/ESM interop hell), external deps
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    platform: 'node',
    target: 'node18',
    outDir: 'dist',
    splitting: false,
    external: externalPackages,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
