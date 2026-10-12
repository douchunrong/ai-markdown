#!/usr/bin/env bash
# 开发环境应用改名：将 node_modules 内 Electron.app 的显示名改为 AI Markdown。
# 背景：macOS 应用菜单标题取自应用包 Info.plist 的 CFBundleName，
#       开发模式直接运行官方 Electron.app，默认显示 "Electron"。
# 通过 package.json 的 postinstall 钩子自动执行，重装依赖后依然生效。
# 打包产物不受影响（electron-builder 使用 productName: AI Markdown）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/src/node_modules/electron/dist/Electron.app"
PLIST="$APP/Contents/Info.plist"
NAME="AI Markdown"

if [ ! -f "$PLIST" ]; then
  echo "[electron-dev-name] 未找到 Electron.app（跳过）：$PLIST"
  exit 0
fi

PB=/usr/libexec/PlistBuddy
current="$($PB -c 'Print :CFBundleName' "$PLIST" 2>/dev/null || echo '')"
if [ "$current" = "$NAME" ]; then
  echo "[electron-dev-name] 已是 $NAME，跳过"
  exit 0
fi

$PB -c "Set :CFBundleName $NAME" "$PLIST"
$PB -c "Add :CFBundleDisplayName string $NAME" "$PLIST" 2>/dev/null \
  || $PB -c "Set :CFBundleDisplayName $NAME" "$PLIST"

# 修改 Info.plist 后原 ad-hoc 签名失效，需重签（本地开发用）
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 \
  && echo "[electron-dev-name] 已改名为 $NAME 并重签" \
  || echo "[electron-dev-name] 已改名为 $NAME（重签失败，如启动异常请手动执行 codesign）"
