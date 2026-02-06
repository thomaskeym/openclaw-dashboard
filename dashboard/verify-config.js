#!/usr/bin/env node

// 验证配置脚本
const path = require('path');
const fs = require('fs');
const express = require('express');

console.log('=== 配置验证 ===\n');

// 1. 检查路径
const staticDir = path.resolve(__dirname, 'static');
const cssPath = path.join(staticDir, 'css', 'style.css');
const jsPath = path.join(staticDir, 'js', 'dashboard.js');

console.log('1. 路径检查:');
console.log(`   __dirname: ${__dirname}`);
console.log(`   staticDir: ${staticDir}`);
console.log(`   CSS路径: ${cssPath}`);
console.log(`   JS路径: ${jsPath}`);

// 2. 检查文件存在
console.log('\n2. 文件存在性:');
console.log(`   静态目录存在: ${fs.existsSync(staticDir)}`);
console.log(`   CSS文件存在: ${fs.existsSync(cssPath)}`);
console.log(`   JS文件存在: ${fs.existsSync(jsPath)}`);

// 3. 测试Express静态文件服务
console.log('\n3. Express静态文件服务测试:');
const app = express();
app.use('/static', express.static(staticDir));

// 模拟请求
const testRequest = {
  url: '/static/css/style.css',
  path: '/css/style.css',
  method: 'GET'
};

console.log(`   请求URL: ${testRequest.url}`);
console.log(`   Express会映射到: ${path.join(staticDir, testRequest.path)}`);
console.log(`   文件存在: ${fs.existsSync(path.join(staticDir, testRequest.path))}`);

// 4. 检查index.html中的引用
console.log('\n4. HTML文件检查:');
const indexPath = path.join(__dirname, 'index.html');
if (fs.existsSync(indexPath)) {
  const htmlContent = fs.readFileSync(indexPath, 'utf-8');
  const cssRef = htmlContent.match(/href=["']([^"']*style\.css[^"']*)["']/);
  const jsRef = htmlContent.match(/src=["']([^"']*dashboard\.js[^"']*)["']/);
  console.log(`   CSS引用: ${cssRef ? cssRef[1] : '未找到'}`);
  console.log(`   JS引用: ${jsRef ? jsRef[1] : '未找到'}`);
}

console.log('\n=== 验证完成 ===');
console.log('\n如果所有检查都通过，请手动启动服务器:');
console.log('  cd <项目目录>');
console.log('  npm start');
