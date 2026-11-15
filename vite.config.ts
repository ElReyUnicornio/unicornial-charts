import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'UnicornialCharts',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'unicornial-charts.js' : 'unicornial-charts.umd.cjs'),
    },
    sourcemap: true,
  },
})
