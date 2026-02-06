#!/bin/bash

# OpenClaw Dashboard 启动脚本
# 注意：必须在终端前台运行

cd "$(dirname "$0")"

echo "🎩 启动OpenClaw作战指挥中心看板..."
echo ""

# 检查端口是否被占用
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  端口3000已被占用，正在停止旧进程..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 2
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
    echo ""
fi

# 启动服务器
echo "🚀 启动服务器..."
echo "   访问地址: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 前台运行
node server.js
