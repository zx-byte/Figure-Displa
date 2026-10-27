@echo off
chcp 936 >nul
cd /d "%~dp0"
title 作品工作室 · 拾光手办

echo.
echo   正在启动作品工作室...

node scripts\studio.js %*
if errorlevel 1 (
  echo.
  echo   启动失败。请检查：
  echo     1. 是否已安装 Node.js
  echo     2. 是否已安装 Python 的 Pillow：pip install Pillow
  echo.
  pause
)
