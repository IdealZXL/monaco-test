# Monaco C# Editor

基于 Monaco Editor 的 C# 在线编辑器示例，包含：

- C# 语法高亮、括号/注释配置和代码折叠
- 关键字、.NET 常用类型、代码片段补全
- 从当前文档提取变量和方法名的上下文补全
- 基础诊断：括号匹配和疑似缺失分号提示
- 调试面板：断点、运行到断点、单步、重启、停止、变量、调用栈和控制台输出

> 当前调试器在浏览器端模拟执行常见 C# 语句（变量声明、赋值、`Console.WriteLine` 等），用于前端交互验证。生产级 C# 智能补全/调试可在此基础上接入 Roslyn Language Server 和 Debug Adapter Protocol 服务。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```
