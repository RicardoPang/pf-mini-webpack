// 自定义JSON加载器
export function jsonLoader(source) {
  console.log("jsonLoader----------------", source);
  this.addDeps("jsonLoader"); // 添加依赖关系

  return `export default ${JSON.stringify(source)}`; // 将 JSON 内容转换为 ES6 模块导出
}
