// 最简单的静态文件服务器测试
const express = require('express');
const path = require('path');
const app = express();

const staticDir = path.resolve(__dirname, 'static');
console.log('静态目录:', staticDir);

// 最简单的配置
app.use('/static', express.static(staticDir));

app.get('/', (req, res) => {
  res.send(`
    <html>
    <head>
      <link rel="stylesheet" href="/static/css/style.css">
    </head>
    <body>
      <h1>测试页面</h1>
      <p>如果看到样式，说明静态文件服务正常</p>
    </body>
    </html>
  `);
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`测试服务器运行在 http://localhost:${PORT}`);
  console.log(`测试: curl http://localhost:${PORT}/static/css/style.css`);
});
