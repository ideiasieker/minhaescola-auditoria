import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.banco.test.ts'],
    globalSetup: ['src/teste/preparar-banco.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
