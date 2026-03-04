import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { server: 'index.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  platform: 'node',
  target: 'node18',
  outDir: 'dist',
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
