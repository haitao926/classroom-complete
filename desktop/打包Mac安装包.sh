#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo " 课堂随记 - 生成 macOS DMG 安装包"
echo "========================================"
echo ""

export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

echo "[1/2] 正在检查并安装桌面端依赖..."
npm install

echo ""
echo "[2/2] 正在构建 macOS DMG 安装包..."
# 检查当前 Mac 芯片架构
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo "检测到 Apple Silicon (arm64) 架构，构建 arm64 DMG..."
    npm run dist:mac:arm64
else
    echo "检测到 Intel (x64) 架构，构建 x64 DMG..."
    npm run dist:mac:x64
fi

echo ""
echo "========================================"
echo "[成功] 打包完成！安装包已生成到 desktop/dist 目录。"
echo "========================================"
