@echo off
chcp 65001 >nul
title 生成 Windows 安装包 (NSIS)
cd /d "%~dp0"

echo ========================================
echo  课堂随记 - 生成 Windows 安装包 (NSIS)
echo ========================================
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo [1/2] 正在检查并安装桌面端依赖...
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络连接或 Node.js 环境。
    pause
    exit /b 1
)

echo.
echo [2/2] 正在构建 Windows NSIS 安装包...
call npm run dist:win
if errorlevel 1 (
    echo [错误] 打包失败。
    pause
    exit /b 1
)

echo.
echo ========================================
echo [成功] 打包完成！安装包已生成到 desktop/dist 目录。
echo ========================================
pause
