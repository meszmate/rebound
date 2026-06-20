import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['client/js/easing/**'],
      reporter: ['text', 'html'],
    },
  },
});
