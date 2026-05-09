import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts', 'src/**/*.test.ts', 'src/__mocks__/**']
    },
    alias: {
      'vscode': path.resolve(__dirname, 'src/__mocks__/vscode.ts')
    }
  }
});
