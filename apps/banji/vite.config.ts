import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/i/banji/',
  plugins: [react()],
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
