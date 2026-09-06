import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { banjiShellSw } from './scripts/swPlugin.ts'

export default defineConfig({
  base: '/i/banji/',
  plugins: [react(), banjiShellSw()],
  build: {
    outDir: '../../i/banji',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
  },
})
