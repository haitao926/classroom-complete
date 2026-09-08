@echo off
chcp 65001 >nul
title 生成 Windows 绿色免安装版 (Portable)
cd /d "%~dp0"

echo ========================================
echo  课堂随记 - 生成 Windows 绿色免安装版
echo  说明: 生成单个可执行程序，机房无需管理员权限安装
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
echo [2/2] 正在构建 Windows Portable 绿色免安装版...
call npm run dist:win:portable
if errorlevel 1 (
    echo [错误] 打包失败。
    pause
    exit /b 1
)

echo.
echo ========================================
echo [成功] 打包完成！免安装程序已生成到 desktop/dist 目录。
echo ========================================
pause
