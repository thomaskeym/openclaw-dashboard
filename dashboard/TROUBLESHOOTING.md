# 故障排查指南 - CSS文件404问题

文中的 **<项目目录>** 指 dashboard 项目根目录（即包含 `server.js` 的目录）。

## 问题现象
- CSS文件返回404错误
- 浏览器无法加载样式

## 已确认的配置
✅ 文件存在：`<项目目录>/static/css/style.css`
✅ 路径配置正确：`path.resolve(__dirname, 'static')`
✅ Express静态文件中间件配置正确

## 解决方案

### 方案1：确保服务器在前台运行（推荐）

**重要**：由于macOS安全限制，服务器必须在终端前台运行，不能后台运行。

```bash
cd <项目目录>
npm start
```

保持这个终端窗口打开，不要关闭。

### 方案2：检查服务器日志

启动服务器后，当浏览器请求CSS时，查看控制台输出：

```
[静态文件请求] GET /static/css/style.css
  req.path: /css/style.css
  relativePath: css/style.css
  映射到文件: <项目目录>/static/css/style.css
  文件存在: true
```

如果看到"文件存在: false"，说明路径映射有问题。

### 方案3：手动测试

在服务器运行的情况下，打开新终端：

```bash
# 测试CSS文件
curl -I http://localhost:3000/static/css/style.css

# 应该返回：
# HTTP/1.1 200 OK
# Content-Type: text/css; charset=utf-8
```

### 方案4：检查浏览器

1. 打开浏览器开发者工具（F12）
2. 查看Network标签
3. 刷新页面（Cmd+Shift+R）
4. 查看`/static/css/style.css`请求：
   - 状态码应该是200
   - 如果显示404，检查请求URL是否正确

### 方案5：使用其他端口

如果3000端口有问题，尝试其他端口：

```bash
PORT=8080 npm start
```

然后访问：`http://localhost:8080`

## 当前配置说明

Express静态文件中间件的配置：

```javascript
app.use('/static', express.static(staticDir));
```

这个配置意味着：
- 请求 `/static/css/style.css` 
- 会被映射到 `staticDir/css/style.css`
- 即 `<项目目录>/static/css/style.css`

## 如果问题仍然存在

1. **检查文件权限**：
   ```bash
   ls -la <项目目录>/static/css/style.css
   ```

2. **检查服务器是否真的在运行**：
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **查看服务器完整日志**：
   启动服务器时，查看所有控制台输出

4. **尝试最简单的配置**：
   编辑`server.js`，临时移除所有中间件，只保留：
   ```javascript
   app.use('/static', express.static(path.resolve(__dirname, 'static')));
   ```

## 常见错误

### 错误1：端口被占用
```
Error: listen EADDRINUSE: address already in use :::3000
```
**解决**：停止占用端口的进程或使用其他端口

### 错误2：权限问题
```
Error: listen EPERM: operation not permitted
```
**解决**：必须在终端前台运行，不要后台运行

### 错误3：文件不存在
**解决**：检查文件路径和权限
