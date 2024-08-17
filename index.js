import fs from "fs";
import path from "path";
import ejs from "ejs";
import parser from "@babel/parser";
import traverse from "@babel/traverse";
import { transformFromAst } from "babel-core";
import { jsonLoader } from "./jsonLoader.js";
import { ChangeOutputPath } from "./ChangeOutputPath.js";
import { SyncHook } from "tapable";

// 生产模块唯一标识符
let id = 0;

// webpack配置
const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.json$/, // 匹配json文件
        use: [jsonLoader], // 使用jsonLoader处理json文件
      },
    ],
  },

  plugins: [new ChangeOutputPath()], // 配置自定义插件
};

// 定义钩子, 用于在生成文件时触发
const hooks = {
  emitFile: new SyncHook(["context"]),
};

// 创建模块内容
function createAsset(filePath) {
  // 1. 获取文件的内容
  // ast -> 抽象语法数
  let source = fs.readFileSync(filePath, {
    encoding: "utf-8",
  });

  // 初始化加载器上下文, 用于传递额外的信息给加载器
  const loaders = webpackConfig.module.rules;
  const loaderContext = {
    addDeps(dep) {
      console.log("addDeps", dep);
    },
  };

  // 修改配置中的规则, 依次应用匹配的加载器
  loaders.forEach(({ test, use }) => {
    if (test.test(filePath)) {
      if (Array.isArray(use)) {
        use.forEach((fn) => {
          source = fn.call(loaderContext, source); // 调用加载器处理文件内容
        });
      }
    }
  });

  // 2. 获取依赖关系
  const ast = parser.parse(source, {
    sourceType: "module",
  });
  const deps = [];
  traverse.default(ast, {
    ImportDeclaration({ node }) {
      deps.push(node.source.value); // 将所有import的模块路径存入deps数组
    },
  });
  // 使用babel将ast转换为兼容性代码
  const { code } = transformFromAst(ast, null, {
    presets: ["env"],
  });

  return {
    filePath,
    code,
    deps,
    mapping: {},
    id: id++,
  };
}

// 创建依赖图(每个文件为一个节点)
function createGraph() {
  const mainAsset = createAsset("./example/main.js"); // 解析入口文件

  const queue = [mainAsset]; // 使用队列存储和处理每个模块

  for (const asset of queue) {
    asset.deps.forEach((relativePath) => {
      const child = createAsset(path.resolve("./example", relativePath)); // 递归解析依赖模块
      asset.mapping[relativePath] = child.id; // 将依赖模块的路径映射对应的id
      queue.push(child); // 将依赖模块加入队列
    });
  }

  return queue; // 返回依赖图
}

// 初始化插件机制
function initPlugins() {
  const plugins = webpackConfig.plugins;

  plugins.forEach((plugin) => {
    plugin.apply(hooks); // 调用插件的apply方法, 并传入钩子
  });
}

initPlugins(); // 初始化插件
const graph = createGraph();

// 构建最终的输出文件
function build(graph) {
  // 读取ejs模板
  const template = fs.readFileSync("./bundle.ejs", { encoding: "utf-8" });
  const data = graph.map((asset) => {
    const { id, code, mapping } = asset;
    return {
      id,
      code,
      mapping,
    };
  });
  const code = ejs.render(template, { data });

  // 默认输出路径
  let outputPath = "./dist/bundle.js";
  const context = {
    changeOutputPath(path) {
      outputPath = path; // 允许插件修改输出路径
    },
  };
  hooks.emitFile.call(context); // 触发emitFile钩子, 允许插件在写入文件前修改输出路径
  fs.writeFileSync(outputPath, code); // 写入最终的输出文件
}

build(graph); // 执行构建
