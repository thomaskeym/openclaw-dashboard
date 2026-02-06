#!/usr/bin/env node

// 简单的服务器健康检查脚本

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

const options = {
  hostname: HOST,
  port: PORT,
  path: '/api/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ 服务器运行正常');
      console.log('响应数据:', data);
      process.exit(0);
    } else {
      console.log(`❌ 服务器返回错误状态码: ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ 无法连接到服务器');
  console.log(`错误信息: ${error.message}`);
  console.log(`\n请确保服务器正在运行:`);
  console.log(`  cd <项目目录>`);
  console.log(`  npm start`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ 连接超时');
  req.destroy();
  process.exit(1);
});

req.end();
