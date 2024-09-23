import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/util': resolve(__dirname, 'src/util'),
      '@/types': resolve(__dirname, 'src/types'),
      '@/module': resolve(__dirname, 'src/module'),
      '@/lib': resolve(__dirname, 'src/lib'),
      '@/handlers': resolve(__dirname, 'src/handlers'),
      '@/test': resolve(__dirname, 'src/test')
    }
  },
  test: {
    // silent: true,
    globals: true,
    tsconfig: './tsconfig.json',
    include: ['**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/*.test.ts']
    },
    logLevel: 'info'
  }
});
