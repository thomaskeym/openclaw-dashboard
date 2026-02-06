#!/usr/bin/env node

// 诊断脚本：检查服务器配置和文件

const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('🔍 OpenClaw Dashboard 诊断工具\n');

// 1. 检查文件是否存在
console.log('1. 检查文件结构:');
const files = [
  'server.js',
  'index.html',
  'data-collector.js',
  'static/css/style.css',
  'static/js/dashboard.js'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) {
    console.log(`      路径: ${filePath}`);
  }
});

// 2. 检查package.json依赖
console.log('\n2. 检查依赖:');
try {
  const packageJson = require('./package.json');
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  const hasNodeModules = fs.existsSync(nodeModulesPath);
  
  console.log(`   ${hasNodeModules ? '✅' : '❌'} node_modules 目录`);
  
  if (hasNodeModules) {
    const requiredDeps = ['express', 'ws', 'cors', 'chokidar'];
    requiredDeps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      const exists = fs.existsSync(depPath);
      console.log(`   ${exists ? '✅' : '❌'} ${dep}`);
    });
  }
} catch (error) {
  console.log(`   ❌ 无法读取package.json: ${error.message}`);
}

// 3. 检查服务器是否运行
console.log('\n3. 检查服务器状态:');
const PORT = process.env.PORT || 3000;
const testUrl = `http://localhost:${PORT}`;

const req = http.request({
  hostname: 'localhost',
  port: PORT,
  path: '/',
  method: 'GET',
  timeout: 2000
}, (res) => {
  console.log(`   ✅ 服务器正在运行 (状态码: ${res.statusCode})`);
  
  // 测试静态文件
  const staticReq = http.request({
    hostname: 'localhost',
    port: PORT,
    path: '/static/css/style.css',
    method: 'GET',
    timeout: 2000
  }, (staticRes) => {
    console.log(`   ${staticRes.statusCode === 200 ? '✅' : '❌'} CSS文件可访问 (状态码: ${staticRes.statusCode})`);
    process.exit(0);
  });
  
  staticReq.on('error', (err) => {
    console.log(`   ❌ CSS文件无法访问: ${err.message}`);
    process.exit(1);
  });
  
  staticReq.on('timeout', () => {
    console.log(`   ❌ CSS文件请求超时`);
    staticReq.destroy();
    process.exit(1);
  });
  
  staticReq.end();
});

req.on('error', (err) => {
  console.log(`   ❌ 服务器未运行: ${err.message}`);
  console.log(`\n   请启动服务器:`);
  console.log(`     cd ${__dirname}`);
  console.log(`     npm start`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log(`   ❌ 连接超时`);
  req.destroy();
  process.exit(1);
});

req.end();
