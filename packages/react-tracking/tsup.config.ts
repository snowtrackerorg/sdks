import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.build.json',
  // Marks the bundle as a Client Component boundary, so a Next.js App Router
  // page can import <LiveTracker> from a Server Component with no wrapper.
  banner: { js: "'use client';" },
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
