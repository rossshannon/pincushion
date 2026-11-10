import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // Production builds are served from GitHub Pages at /pincushion/, and
  // `npm run preview` has to serve the build from the same path or its
  // asset links 404. The dev server uses root, so `npm start` opens at
  // http://localhost:5173/.
  base: command === 'build' || isPreview ? '/pincushion/' : '/',
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__testing__/setupTests.ts'],
    fakeTimers: {
      // Match Jest's default: only fake timer-related globals, not microtasks.
      // Without toFake, Vitest also fakes queueMicrotask/process.nextTick,
      // which breaks @testing-library's waitFor polling. shouldAdvanceTime
      // lets async gaps progress so waitFor can resolve.
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      shouldAdvanceTime: true,
    },
    include: [
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'src/__testing__/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/__testing__/**', 'src/index.tsx'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
}));
