// 自定义插件, 修改输出路径
export class ChangeOutputPath {
  apply(hooks) {
    hooks.emitFile.tap("changeOutputPath", (context) => {
      console.log("--------------changeoutputpath");
      context.changeOutputPath("./dist/pfBundle.js");
    });
  }
}
