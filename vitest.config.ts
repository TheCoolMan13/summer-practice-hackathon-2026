import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Use node environment by default
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [
      // Use jsdom for React component tests
      ['src/**/*.test.tsx', 'jsdom'],
    ],
  },
})
