// 测试静态文件服务
const express = require('express');
const path = require('path');
const app = express();

const PORT = 3001;

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>测试静态文件</title>
      <link rel="stylesheet" href="/static/css/style.css">
    </head>
    <body>
      <h1>测试页面</h1>
      <p>如果看到样式，说明静态文件服务正常</p>
      <script src="/static/js/dashboard.js"></script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`测试服务器运行在 http://localhost:${PORT}`);
  console.log(`静态文件目录: ${path.join(__dirname, 'static')}`);
});
