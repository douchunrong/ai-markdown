#!/usr/bin/env bash
# 一键打包脚本：按平台选择打包 AI Markdown。
# 用法：
#   ./scripts/build.sh              # 交互式选择平台
#   ./scripts/build.sh win          # Windows（NSIS 安装包）
#   ./scripts/build.sh linux        # Linux（AppImage + deb）
#   ./scripts/build.sh mac          # macOS（DMG）
#   ./scripts/build.sh web          # 纯 Web 构建（dist/）
#   ./scripts/build.sh ios          # Web 构建 + Capacitor iOS 同步
#   ./scripts/build.sh all          # 依次打包桌面三平台（建议在对应系统上执行）
# 说明：跨平台打包受工具链限制 —— Windows/Linux 建议在对应系统上执行；
#       macOS 上可打包 dmg 与（大部分情况的）win/linux 产物。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src"

cd "$SRC"

show_menu() {
  echo "========================================"
  echo "  AI Markdown 一键打包"
  echo "========================================"
  echo "  1) Windows   （NSIS 安装包）"
  echo "  2) Linux     （AppImage + deb）"
  echo "  3) macOS     （DMG）"
  echo "  4) Web       （静态文件 dist/）"
  echo "  5) iOS       （Web 构建 + Capacitor 同步）"
  echo "  6) 全部桌面  （win + linux + mac）"
  echo "  0) 退出"
  echo "----------------------------------------"
  read -r -p "请选择打包平台 [0-6]: " choice
}

run_build() {
  local target="$1"
  echo ""
  echo ">>> 开始打包：$target"
  case "$target" in
    win)   npm run build:win ;;
    linux) npm run build:linux ;;
    mac)   npm run build:mac ;;
    web)   npm run build:web ;;
    ios)   npm run ios:sync ;;
    all)
      npm run build:win
      npm run build:linux
      npm run build:mac
      ;;
    *) echo "未知目标：$target"; exit 1 ;;
  esac
  echo ">>> 打包完成：$target"
}

# 参数模式
if [ "${1:-}" != "" ]; then
  run_build "$1"
  exit 0
fi

# 交互模式
while true; do
  show_menu
  case "$choice" in
    1) run_build win;   break ;;
    2) run_build linux; break ;;
    3) run_build mac;   break ;;
    4) run_build web;   break ;;
    5) run_build ios;   break ;;
    6) run_build all;   break ;;
    0) exit 0 ;;
    *) echo "无效选择，请重试" ;;
  esac
done
