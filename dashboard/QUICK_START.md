# 快速启动指南

文中的 **<项目目录>** 指 dashboard 项目根目录（即包含 `server.js` 的目录）。

## ⚠️ 重要提示

由于macOS安全限制，**服务器必须在终端前台运行**，不能使用后台运行（`&` 或 `nohup`）。

## 启动步骤

### 方法1：使用启动脚本（推荐）

```bash
cd <项目目录>
./start-server.sh
```

### 方法2：直接使用npm

```bash
cd <项目目录>
npm start
```

### 方法3：直接运行Node.js

```bash
cd <项目目录>
node server.js
```

## 验证服务器运行

启动后，您应该看到：

```
静态文件目录: <项目目录>/static
静态目录存在: true
CSS文件存在: true

🎩 OpenClaw作战指挥中心看板服务器
   访问地址: http://localhost:3000
```

## 测试

在新终端窗口运行：

```bash
# 测试首页
curl http://localhost:3000

# 测试CSS文件
curl -I http://localhost:3000/static/css/style.css

# 应该返回: HTTP/1.1 200 OK
```

## 访问看板

在浏览器中打开：`http://localhost:3000`

## 如果CSS仍然无法加载

1. **检查服务器日志**：查看启动服务器的终端窗口，当浏览器请求CSS时应该看到：
   ```
   [静态文件请求] GET /static/css/style.css
     req.path: /css/style.css
     映射到文件: <项目目录>/static/css/style.css
     文件存在: true
   ```

2. **检查浏览器控制台**：
   - 按F12打开开发者工具
   - 查看Network标签
   - 刷新页面（Cmd+Shift+R）
   - 查看`/static/css/style.css`请求的状态码

3. **如果返回404**：
   - 确认服务器正在运行
   - 检查服务器日志中的路径映射
   - 确认文件确实存在：`ls -la static/css/style.css`

## 停止服务器

在运行服务器的终端窗口按 `Ctrl+C`
