export const files = [
  'webpack/lib/Chunk',
  'webpack/lib/Compilation',
  'webpack/lib/dependencies/ConstDependency',
  'webpack/lib/javascript/JavascriptParserHelpers',
  'webpack/lib/LibraryTemplatePlugin',
  'webpack/lib/LoaderTargetPlugin',
  'webpack/lib/node/NodeTargetPlugin',
  'webpack/lib/node/NodeTemplatePlugin',
  'webpack/lib/ModuleFilenameHelpers',
  'webpack/lib/NormalModule',
  'webpack/lib/RequestShortener',
  'webpack/lib/RuntimeGlobals',
  'webpack/lib/RuntimeModule',
  'webpack/lib/optimize/LimitChunkCountPlugin',
  'webpack/lib/ParserHelpers',
  'webpack/lib/SingleEntryPlugin',
  'webpack/lib/Template',
  'webpack/lib/webworker/WebWorkerTemplatePlugin',
];

export function getFileName(filePath: string) {
  return filePath.split('/').slice(-1)[0];
}

let inited = false;

export function init() {
  // Allow run once
  if (inited) return;
  inited = true;

  const filesMap = files.map((file) => {
    const fileName = getFileName(file);
    return [file, `@umijs/deps/compiled/webpack/${fileName}`];
  });

  /*
{"webpack" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/webpack.js"}
1:
{"webpack/package.json" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/pkgInfo.js"}
2:
{"webpack/lib/Chunk" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/Chunk.js"}
3:
{"webpack/lib/Compilation" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/Compilation.js"}
4:
{"webpack/lib/dependencies/ConstDependency" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/ConstDependency.js"}
5:
{"webpack/lib/javascript/JavascriptParserHelpers" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/JavascriptParserHelpers.js"}
6:
{"webpack/lib/LibraryTemplatePlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/LibraryTemplatePlugin.js"}
7:
{"webpack/lib/LoaderTargetPlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/LoaderTargetPlugin.js"}
8:
{"webpack/lib/node/NodeTargetPlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/NodeTargetPlugin.js"}
9:
{"webpack/lib/node/NodeTemplatePlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/NodeTemplatePlugin.js"}
10:
{"webpack/lib/ModuleFilenameHelpers" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/ModuleFilenameHelpers.js"}
11:
{"webpack/lib/NormalModule" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/NormalModule.js"}
12:
{"webpack/lib/RequestShortener" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/RequestShortener.js"}
13:
{"webpack/lib/RuntimeGlobals" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/RuntimeGlobals.js"}
14:
{"webpack/lib/RuntimeModule" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/RuntimeModule.js"}
15:
{"webpack/lib/optimize/LimitChunkCountPlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/LimitChunkCountPlugin.js"}
16:
{"webpack/lib/ParserHelpers" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/ParserHelpers.js"}
17:
{"webpack/lib/SingleEntryPlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/SingleEntryPlugin.js"}
18:
{"webpack/lib/Template" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/Template.js"}
19:
{"webpack/lib/webworker/WebWorkerTemplatePlugin" => "/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/deps/compiled/webpack/WebWorkerTemplatePlugin.js"}

  */
  const hookPropertyMap = new Map(
    [
      ['webpack', '@umijs/deps/compiled/webpack'],
      ['webpack/package.json', '@umijs/deps/compiled/webpack/pkgInfo'],
      ...filesMap,
      // ['webpack-sources', '@umijs/deps/compiled/webpack/sources'],
    ].map(([request, replacement]) => [request, require.resolve(replacement)]),
  );

  const mod = require('module');
  // require.resolve ，require : 会执行 _resolveFilename
  // require.resolve('./b.js') , request === ./b.js
  const resolveFilename = mod._resolveFilename;
  mod._resolveFilename = function (
    request: string,
    parent: any,
    isMain: boolean,
    options: any,
  ) {
    // 对 wepback require webpack/lib/RuntimeGlobals... 使用缓存
    const hookResolved = hookPropertyMap.get(request);
    if (hookResolved) request = hookResolved;
    return resolveFilename.call(mod, request, parent, isMain, options);
  };
}
