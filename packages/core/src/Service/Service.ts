import { AsyncSeriesWaterfallHook } from '@umijs/deps/compiled/tapable';
import { BabelRegister, lodash, NodeEnv } from '@umijs/utils';
import assert from 'assert';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import Config from '../Config/Config';
import { getUserConfigWithKey } from '../Config/utils/configUtils';
import Logger from '../Logger/Logger';
import {
  ApplyPluginsType,
  ConfigChangeType,
  EnableBy,
  PluginType,
  ServiceStage,
} from './enums';
import getPaths from './getPaths';
import PluginAPI from './PluginAPI';
import { ICommand, IHook, IPackage, IPlugin, IPreset } from './types';
import isPromise from './utils/isPromise';
import loadDotEnv from './utils/loadDotEnv';
import { pathToObj, resolvePlugins, resolvePresets } from './utils/pluginUtils';

const logger = new Logger('umi:core:Service');

export interface IServiceOpts {
  cwd: string;
  pkg?: IPackage;
  presets?: string[];
  plugins?: string[];
  configFiles?: string[];
  env?: NodeEnv;
}

interface IConfig {
  presets?: string[];
  plugins?: string[];
  [key: string]: any;
}

// TODO
// 1. duplicated key
/*
插件系统是如何生成的：
1. 从package.json 获取所有的presets
2.



*/
export default class Service extends EventEmitter {
  cwd: string;
  pkg: IPackage;
  skipPluginIds: Set<string> = new Set<string>();
  // lifecycle stage
  stage: ServiceStage = ServiceStage.uninitialized;
  // registered commands
  commands: {
    [name: string]: ICommand | string;
  } = {};
  // including presets and plugins
  plugins: {
    [id: string]: IPlugin;
  } = {};
  // plugin methods
  // 所有的插件 function
  pluginMethods: {
    [name: string]: Function;
  } = {};
  // initial presets and plugins from arguments, config, process.env, and package.json
  initialPresets: IPreset[];
  initialPlugins: IPlugin[];
  // presets and plugins for registering
  _extraPresets: IPreset[] = [];
  _extraPlugins: IPlugin[] = [];
  // user config
  userConfig: IConfig;
  configInstance: Config;
  config: IConfig | null = null;
  // babel register
  babelRegister: BabelRegister;
  // hooks
  hooksByPluginId: {
    [id: string]: IHook[];
  } = {};
  hooks: {
    [key: string]: IHook[];
  } = {};
  // paths
  paths: {
    cwd?: string;
    absNodeModulesPath?: string;
    absSrcPath?: string;
    absPagesPath?: string;
    absOutputPath?: string;
    absTmpPath?: string;
  } = {};
  env: string | undefined;
  ApplyPluginsType = ApplyPluginsType;
  EnableBy = EnableBy;
  ConfigChangeType = ConfigChangeType;
  ServiceStage = ServiceStage;
  args: any;

  /*
1. 读取配置文件 .urmc.ts ,babel register 编译代码
2. 导入env
3. 从配置获取 babel plugins presets
  */
  constructor(opts: IServiceOpts) {
    super();

    logger.debug('opts:');
    logger.debug(opts);
    this.cwd = opts.cwd || process.cwd();
    // repoDir should be the root dir of repo
    this.pkg = opts.pkg || this.resolvePackage();
    this.env = opts.env || process.env.NODE_ENV;

    assert(existsSync(this.cwd), `cwd ${this.cwd} does not exist.`);

    // register babel before config parsing
    this.babelRegister = new BabelRegister();

    // load .env or .local.env
    logger.debug('load env');
    this.loadEnv();

    // get user config without validation
    logger.debug('get user config');
    const configFiles = opts.configFiles;
    this.configInstance = new Config({
      cwd: this.cwd,
      service: this,
      localConfig: this.env === 'development',
      configFiles:
        Array.isArray(configFiles) && !!configFiles[0]
          ? configFiles
          : undefined,
    });
    /*
读取 .umrc.ts 等配置文件，babelregister 编译 ts 文件,
获取到的所有配置文件合并

fastRefresh:
{}
nodeModulesTransform:
{type: 'none'}
routes:
(1) [{…}]
0:
{path: '/', component: '@/pages/index'}
    */
    this.userConfig = this.configInstance.getUserConfig();
    logger.debug('userConfig:');
    logger.debug(this.userConfig);

    // get paths
    // 获取配置的所有路径
    /*
absNodeModulesPath: '/Users/a/github/zzzzzz/umiapp/node_modules'
absOutputPath: '/Users/a/github/zzzzzz/umiapp/dist'
absPagesPath: '/Users/a/github/zzzzzz/umiapp/src/pages'
absSrcPath: '/Users/a/github/zzzzzz/umiapp/src'
absTmpPath: '/Users/a/github/zzzzzz/umiapp/src/.umi'
cwd: '/Users/a/github/zzzzzz/umiapp'

    */
    this.paths = getPaths({
      cwd: this.cwd,
      config: this.userConfig!,
      env: this.env,
    });
    logger.debug('paths:');
    logger.debug(this.paths);

    // setup initial presets and plugins
    const baseOpts = {
      pkg: this.pkg,
      cwd: this.cwd,
    };
    // 从 package.json deps 和 devdeps ,用户配置获取 presets:
    /*
[
  {
    id: '@umijs/preset-built-in',
    key: 'builtIn',
    path: '/Users/a/github/zzzzzz/umiapp/node_modules/umi/node_modules/@umijs/preset-built-in/lib/index.js',
    defaultConfig: null,
    apply:(){}
  },
  {
    id: '@umijs/preset-react',
    key: 'react',
    path: '/Users/a/github/zzzzzz/umiapp/node_modules/@umijs/preset-react/lib/index.js',
    defaultConfig: null,
    apply:(){}
  },
];

    */
    this.initialPresets = resolvePresets({
      ...baseOpts,
      presets: opts.presets || [],
      userConfigPresets: this.userConfig.presets || [],
    });
    /*
[
  {
    id: './node_modules/umi/lib/plugins/umiAlias',
    key: 'umiAlias',
    path: '/Users/a/github/zzzzzz/umiapp/node_modules/umi/lib/plugins/umiAlias.js',
    defaultConfig: null,
  },
];


    */
    this.initialPlugins = resolvePlugins({
      ...baseOpts,
      plugins: opts.plugins || [],
      userConfigPlugins: this.userConfig.plugins || [],
    });
    // babel 注册 presets plugins
    this.babelRegister.setOnlyMap({
      key: 'initialPlugins',
      value: lodash.uniq([
        ...this.initialPresets.map(({ path }) => path),
        ...this.initialPlugins.map(({ path }) => path),
      ]),
    });
    logger.debug('initial presets:');
    logger.debug(this.initialPresets);
    logger.debug('initial plugins:');
    logger.debug(this.initialPlugins);
  }

  setStage(stage: ServiceStage) {
    this.stage = stage;
  }

  resolvePackage() {
    try {
      return require(join(this.cwd, 'package.json'));
    } catch (e) {
      return {};
    }
  }

  loadEnv() {
    const basePath = join(this.cwd, '.env');
    const localPath = `${basePath}.local`;
    loadDotEnv(localPath);
    loadDotEnv(basePath);
  }

  // 获取hook ，调用hook ，获取 config ，修改config
  async init() {
    this.setStage(ServiceStage.init);
    // we should have the final hooksByPluginId which is added with api.register()
    await this.initPresetsAndPlugins();

    // collect false configs, then add to this.skipPluginIds
    // skipPluginIds include two parts:
    // 1. api.skipPlugins()
    // 2. user config with the `false` value
    // Object.keys(this.hooksByPluginId).forEach(pluginId => {
    //   const { key } = this.plugins[pluginId];
    //   if (this.getPluginOptsWithKey(key) === false) {
    //     this.skipPluginIds.add(pluginId);
    //   }
    // });

    // delete hooks from this.hooksByPluginId with this.skipPluginIds
    // for (const pluginId of this.skipPluginIds) {
    //   if (this.hooksByPluginId[pluginId]) delete this.hooksByPluginId[pluginId];
    //   delete this.plugins[pluginId];
    // }

    // hooksByPluginId -> hooks
    // hooks is mapped with hook key, prepared for applyPlugins()
    //hooksByPluginId 收集了所有 plugin id 对应的 hook
    this.setStage(ServiceStage.initHooks);
    Object.keys(this.hooksByPluginId).forEach((id) => {
      const hooks = this.hooksByPluginId[id];
      hooks.forEach((hook) => {
        // key ==  name === [addUmiExports ...]
        // id === plugin name
        const { key } = hook;
        hook.pluginId = id;
        this.hooks[key] = (this.hooks[key] || []).concat(hook);
      });
    });

    // plugin is totally ready
    this.setStage(ServiceStage.pluginReady);
    await this.applyPlugins({
      key: 'onPluginReady',
      type: ApplyPluginsType.event,
    });

    // get config, including:
    // 1. merge default config
    // 2. validate
    this.setStage(ServiceStage.getConfig);
    /*
getDefaultConfig = {
  history: { type: 'browser' },
  alias: {
    'react-router': '/Users/a/github/zzzzzz/umiapp/node_modules/react-router',
    'react-router-dom':
      '/Users/a/github/zzzzzz/umiapp/node_modules/react-router-dom',
    history: '/Users/a/github/zzzzzz/umiapp/node_modules/history-with-query',
  },
  analyze: {
    analyzerMode: 'server',
    analyzerPort: 8888,
    openAnalyzer: true,
    generateStatsFile: false,
    statsFilename: 'stats.json',
    logLevel: 'info',
    defaultSizes: 'parsed',
  },
  autoprefixer: { flexbox: 'no-2009' },
  base: '/',
  cssnano: { mergeRules: false, minifyFontValues: { removeQuotes: false } },
  devServer: {},
  mountElementId: 'root',
  nodeModulesTransform: { type: 'all', exclude: [] },
  outputPath: 'dist',
  publicPath: '/',
  targets: {
    node: true,
    chrome: 49,
    firefox: 64,
    safari: 10,
    edge: 13,
    ios: 10,
  },
  locale: {
    baseNavigator: true,
    useLocalStorage: true,
    baseSeparator: '-',
    antd: true,
  },
  request: { dataField: 'data' },
}

    */
    const defaultConfig = await this.applyPlugins({
      key: 'modifyDefaultConfig',
      type: this.ApplyPluginsType.modify,
      //从 hooks 获取config
      initialValue: await this.configInstance.getDefaultConfig(),
    });
    this.config = await this.applyPlugins({
      key: 'modifyConfig',
      type: this.ApplyPluginsType.modify,
      // 合并 校验 config
      initialValue: this.configInstance.getConfig({
        defaultConfig,
      }) as any,
    });

    // merge paths to keep the this.paths ref
    this.setStage(ServiceStage.getPaths);
    // config.outputPath may be modified by plugins
    if (this.config!.outputPath) {
      // '/Users/a/github/zzzzzz/umiapp/dist'
      this.paths.absOutputPath = join(this.cwd, this.config!.outputPath);
    }
    const paths = (await this.applyPlugins({
      key: 'modifyPaths',
      type: ApplyPluginsType.modify,
      initialValue: this.paths,
    })) as object;
    Object.keys(paths).forEach((key) => {
      this.paths[key] = paths[key];
    });
  }

  async initPresetsAndPlugins() {
    this.setStage(ServiceStage.initPresets);
    this._extraPlugins = [];
    while (this.initialPresets.length) {
      await this.initPreset(this.initialPresets.shift()!);
    }

    this.setStage(ServiceStage.initPlugins);
    this._extraPlugins.push(...this.initialPlugins);
    // _extraPlugins.length > 100
    /*
[Plugin,...]
Plugin =  {
  id: './node_modules/umi/node_modules/@@/generateFiles/core/history',
  key: 'history',
  path: '/Users/a/github/zzzzzz/umiapp/node_modules/umi/node_modules/@umijs/preset-built-in/lib/plugins/generateFiles/core/history.js',
  defaultConfig: null,
}

    */
    while (this._extraPlugins.length) {
      await this.initPlugin(this._extraPlugins.shift()!);
    }
  }

  // return api
  getPluginAPI(opts: any) {
    const pluginAPI = new PluginAPI(opts);

    // register built-in methods
    [
      'onPluginReady',
      'modifyPaths',
      'onStart',
      'modifyDefaultConfig',
      'modifyConfig',
    ].forEach((name) => {
      pluginAPI.registerMethod({ name, exitsError: false });
    });

    return new Proxy(pluginAPI, {
      get: (target, prop: string) => {
        // 由于 pluginMethods 需要在 register 阶段可用
        // 必须通过 proxy 的方式动态获取最新，以实现边注册边使用的效果
        // 是否已经注册了 plugin method

        // this 在箭头函数内绑定 class this === Service this
        // [addUmiExports ...] 的函数已经注册了一个空register 函数
        /*
     function (fn: Function | Object) {
        const hook = {
          key: name,
          ...(utils.lodash.isPlainObject(fn) ? fn : { fn }),
        };
        // @ts-ignore
        this.register(hook);
      };

        */
        if (this.pluginMethods[prop]) return this.pluginMethods[prop];
        if (
          [
            'applyPlugins',
            'ApplyPluginsType',
            'EnableBy',
            'ConfigChangeType',
            'babelRegister',
            'stage',
            'ServiceStage',
            'paths',
            'cwd',
            'pkg',
            'userConfig',
            'config',
            'env',
            'args',
            'hasPlugins',
            'hasPresets',
          ].includes(prop)
        ) {
          return typeof this[prop] === 'function'
            ? this[prop].bind(this)
            : this[prop];
        }
        return target[prop];
      },
    });
  }

  async applyAPI(opts: { apply: Function; api: PluginAPI }) {
    // preset apply === require(preset.js)
    let ret = opts.apply()(opts.api);
    if (isPromise(ret)) {
      ret = await ret;
    }
    return ret || {};
  }

  async initPreset(preset: IPreset) {
    const { id, key, apply } = preset;
    preset.isPreset = true;

    const api = this.getPluginAPI({ id, key, service: this });

    // register before apply
    this.registerPlugin(preset);
    // TODO: ...defaultConfigs 考虑要不要支持，可能这个需求可以通过其他渠道实现
    // 导入 presets 返回preset.js 内容
    const { presets, plugins, ...defaultConfigs } = await this.applyAPI({
      api,
      apply,
    });

    // register extra presets and plugins
    if (presets) {
      assert(
        Array.isArray(presets),
        `presets returned from preset ${id} must be Array.`,
      );
      // 插到最前面，下个 while 循环优先执行
      this._extraPresets.splice(
        0,
        0,
        ...presets.map((path: string) => {
          return pathToObj({
            type: PluginType.preset,
            path,
            cwd: this.cwd,
          });
        }),
      );
    }

    // 深度优先
    const extraPresets = lodash.clone(this._extraPresets);
    this._extraPresets = [];
    while (extraPresets.length) {
      await this.initPreset(extraPresets.shift()!);
    }

    if (plugins) {
      assert(
        Array.isArray(plugins),
        `plugins returned from preset ${id} must be Array.`,
      );
      this._extraPlugins.push(
        ...plugins.map((path: string) => {
          return pathToObj({
            type: PluginType.plugin,
            path,
            cwd: this.cwd,
          });
        }),
      );
    }
  }

  async initPlugin(plugin: IPlugin) {
    const { id, key, apply } = plugin;

    const api = this.getPluginAPI({ id, key, service: this });

    // register before apply
    this.registerPlugin(plugin);
    await this.applyAPI({ api, apply });
  }

  getPluginOptsWithKey(key: string) {
    return getUserConfigWithKey({
      key,
      userConfig: this.userConfig,
    });
  }

    // 插入 plugin
  registerPlugin(plugin: IPlugin) {
    // 考虑要不要去掉这里的校验逻辑
    // 理论上不会走到这里，因为在 describe 的时候已经做了冲突校验
    if (this.plugins[plugin.id]) {
      const name = plugin.isPreset ? 'preset' : 'plugin';
      throw new Error(`\
${name} ${plugin.id} is already registered by ${this.plugins[plugin.id].path}, \
${name} from ${plugin.path} register failed.`);
    }
    /*
  '@umijs/preset-built-in': {
    id: '@umijs/preset-built-in',
    key: 'builtIn',
    path: '/Users/a/github/zzzzzz/umiapp/node_modules/umi/node_modules/@umijs/preset-built-in/lib/index.js',
    defaultConfig: null,
    isPreset: true,
  },
    */
    this.plugins[plugin.id] = plugin;
  }

  isPluginEnable(pluginId: string) {
    // api.skipPlugins() 的插件
    if (this.skipPluginIds.has(pluginId)) return false;

    const { key, enableBy } = this.plugins[pluginId];

    // 手动设置为 false
    if (this.userConfig[key] === false) return false;

    // 配置开启
    if (enableBy === this.EnableBy.config && !(key in this.userConfig)) {
      return false;
    }

    // 函数自定义开启
    if (typeof enableBy === 'function') {
      return enableBy();
    }

    // 注册开启
    return true;
  }

  hasPlugins(pluginIds: string[]) {
    return pluginIds.every((pluginId) => {
      const plugin = this.plugins[pluginId];
      return plugin && !plugin.isPreset && this.isPluginEnable(pluginId);
    });
  }

  hasPresets(presetIds: string[]) {
    return presetIds.every((presetId) => {
      const preset = this.plugins[presetId];
      return preset && preset.isPreset && this.isPluginEnable(presetId);
    });
  }

  async applyPlugins(opts: {
    key: string;
    type: ApplyPluginsType;
    initialValue?: any;
    args?: any;
  }) {
    // 获取对应的hook , key === [onGenerateFiles,...]
    //hook={onGenerateFiles: [hook1,hook2,...]}
    const hooks = this.hooks[opts.key] || [];
    switch (opts.type) {
      case ApplyPluginsType.add:
        if ('initialValue' in opts) {
          assert(
            Array.isArray(opts.initialValue),
            `applyPlugins failed, opts.initialValue must be Array if opts.type is add.`,
          );
        }
        const tAdd = new AsyncSeriesWaterfallHook(['memo']);
        for (const hook of hooks) {
          // plugin enableBy => boolean
          if (!this.isPluginEnable(hook.pluginId!)) {
            continue;
          }
          tAdd.tapPromise(
            {
              name: hook.pluginId!,
              stage: hook.stage || 0,
              // @ts-ignore
              before: hook.before,
            },
            async (memo: any[]) => {
              const items = await hook.fn(opts.args);
              return memo.concat(items);
            },
          );
        }
        return await tAdd.promise(opts.initialValue || []);
      case ApplyPluginsType.modify:
        const tModify = new AsyncSeriesWaterfallHook(['memo']);
        for (const hook of hooks) {
          if (!this.isPluginEnable(hook.pluginId!)) {
            continue;
          }
          tModify.tapPromise(
            {
              name: hook.pluginId!,
              stage: hook.stage || 0,
              // @ts-ignore
              before: hook.before,
            },
            async (memo: any) => {
              return await hook.fn(memo, opts.args);
            },
          );
        }
        return await tModify.promise(opts.initialValue);
      case ApplyPluginsType.event:
        const tEvent = new AsyncSeriesWaterfallHook(['_']);
        for (const hook of hooks) {
          if (!this.isPluginEnable(hook.pluginId!)) {
            continue;
          }
          tEvent.tapPromise(
            {
              name: hook.pluginId!,
              stage: hook.stage || 0,
              // @ts-ignore
              before: hook.before,
            },
            async () => {
              await hook.fn(opts.args);
            },
          );
        }
        return await tEvent.promise();
      default:
        throw new Error(
          `applyPlugin failed, type is not defined or is not matched, got ${opts.type}.`,
        );
    }
  }

  // name === dev , args = { _: ["dev"]}
  async run({ name, args = {} }: { name: string; args?: any }) {
    args._ = args._ || [];
    // shift the command itself
    if (args._[0] === name) args._.shift();

    this.args = args;
    await this.init();

    logger.debug('plugins:');
    logger.debug(this.plugins);

    this.setStage(ServiceStage.run);
    await this.applyPlugins({
      key: 'onStart',
      type: ApplyPluginsType.event,
      args: {
        name,
        args,
      },
    });
    return this.runCommand({ name, args });
  }

  async runCommand({ name, args = {} }: { name: string; args?: any }) {
    assert(this.stage >= ServiceStage.init, `service is not initialized.`);

    args._ = args._ || [];
    // shift the command itself
    if (args._[0] === name) args._.shift();

    // hook 的时候注册的 commands : dev : preset-built-in/plugins/commands/dev
    const command =
      typeof this.commands[name] === 'string'
        ? this.commands[this.commands[name] as string]
        : this.commands[name];
    assert(command, `run command failed, command ${name} does not exists.`);

    // dev
    const { fn } = command as ICommand;
    return fn({ args });
  }
}
