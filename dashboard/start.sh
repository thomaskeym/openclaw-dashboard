#!/bin/bash

# OpenClaw作战指挥中心看板启动脚本

cd "$(dirname "$0")"

echo "🎩 启动OpenClaw作战指挥中心看板..."
echo ""

# 检查node_modules是否存在
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
    echo ""
fi

# 启动服务器
echo "🚀 启动服务器..."
echo "访问地址: http://localhost:${PORT:-3000}"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm start
