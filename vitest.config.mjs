export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['node_modules', 'dist', '.playwright-cli', 'node_modules.broken-*'],
  },
};
