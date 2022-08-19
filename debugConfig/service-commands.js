const commands = {
  mfsu: { name: 'mfsu' },
  build: { name: 'build', description: 'build application for production' },
  config: {
    name: 'config',
    description: 'umi config cli',
    details:
      '# List configs\n$ umi config list\n\n# List the specific config\n$ umi config list --name history',
  },
  dev: { name: 'dev', description: 'start a dev server for development' },
  generate: {
    name: 'generate',
    alias: 'g',
    description: 'generate code snippets quickly',
  },
  g: 'generate',
  help: { name: 'help', description: 'show command helps' },
  plugin: {
    name: 'plugin',
    description: 'inspect umi plugins',
    details:
      '# List plugins\n$ umi plugin list\n\n# List plugins with key\n$ umi plugin list --key',
  },
  version: { name: 'version', description: 'show umi version' },
  webpack: { name: 'webpack', description: 'inspect webpack configurations' },
  dva: { name: 'dva' },
  test: {
    name: 'test',
    description: 'test with jest',
    details:
      "\n$ umi-test\n\n# watch mode\n$ umi-test -w\n$ umi-test --watch\n\n# collect coverage\n$ umi-test --coverage\n\n# print debug info\n$ umi-test --debug\n\n# test specified package for lerna package\n$ umi-test --package name\n\n# don't do e2e test\n$ umi-test --no-e2e\n    ",
  },
};
