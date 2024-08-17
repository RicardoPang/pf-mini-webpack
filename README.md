## 使用

```bash
git clone 项目
cd 项目
npm install
node index.js

# 打包结果
dist/pfBundle.js
# 运行结果
example/index.html
```

## 实现 mini 版 webpack 打包器

> 核心: 将多个小模块合并成一个大模块, 让浏览器可以运行打包好的大模块

![miniwebpack](https://p.ipic.vip/pkoab0.jpg)

1. 代码编译
2. 代码转换(json 转 js 等)

- 小模块有依赖关系, 也可能继续加载了其他的一些模块, 可以把它们看成一个图, 最终生成一个 js 脚本
- 图 -> graph -> 脚本

- 内容

```js
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
```

- 依赖关系

```js
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
```

- 根据内容和依赖关系生成图

```js
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
```

- 根据图生成 js 文件

```js
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
```

- 编写 loader(实际是一个 function)

```js
// 自定义JSON加载器
export function jsonLoader(source) {
  this.addDeps("jsonLoader"); // 添加依赖关系
  return `export default ${JSON.stringify(source)}`; // 将 JSON 内容转换为 ES6 模块导出
}

const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.json$/, // 这个loader需要处理的文件(匹配json文件)
        use: [jsonLoader], // 使用jsonLoader处理json文件
      },
    ],
  },

  plugins: [new ChangeOutputPath()], // 配置自定义插件
};

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
```

- 编写 plugin
  - 原理: 基于事件架构进行实现, webpack 在不同阶段会发出不同事件来, 由我们插件编写者拿到它暴露出来的对象, 操作对象上的一些方法, 改变打包的行为
  - 事件机制, webpack 底层实现了一个库 tapable

```js
class ChangeOutputPath {
  apply(compiler) {
    compiler.hooks.emit.tap("ChangeOutputPath", (compilation) => {
      console.log("ChangeOutputPath");
    });
  }
}

// 定义钩子, 用于在生成文件时触发
const hooks = {
  emitFile: new SyncHook(["context"]),
};

// 初始化插件机制
function initPlugins() {
  const plugins = webpackConfig.plugins;

  plugins.forEach((plugin) => {
    plugin.apply(hooks); // 调用插件的apply方法, 并传入钩子
  });
}

initPlugins(); // 初始化插件

// 默认输出路径
let outputPath = "./dist/bundle.js";
const context = {
  changeOutputPath(path) {
    outputPath = path; // 允许插件修改输出路径
  },
};
hooks.emitFile.call(context); // 触发emitFile钩子, 允许插件在写入文件前修改输出路径
```

### 总结

- 如何读取文件内容
- 如何获取依赖关系(基于 ast 基于 babel)
- 如何将 esm 转换成 commonjs(基于 babel)
- 实现了一个简化版的打包工具，类似于 Webpack，能够处理 JavaScript 模块之间的依赖关系，并将它们打包输出为单个文件。代码主要包括模块处理、依赖分析、插件机制和输出文件的生成。
- Webpack 实现：从入口文件开始，递归解析所有模块的依赖关系，通过 Loader 转换模块代码，最后生成打包后的文件并输出。插件通过钩子机制在打包过程中对结果进行影响。
- Loader 编写：Loader 是一个单一的转换器函数，它接收源代码，进行处理，并返回转换后的代码。多个 Loader 可以链式调用，依次处理模块内容。
- Plugin 编写：Plugin 是一个包含 apply 方法的类，通过注册钩子函数与 Webpack 的生命周期集成，执行特定任务，扩展 Webpack 的功能。
