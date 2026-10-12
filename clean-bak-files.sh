#!/bin/bash
# 清理脚本：删除 ppocr-web 目录（含子目录）下所有 *.bak_* 备份文件
#
# 用法：
#   ./clean-bak-files.sh            # 实际删除
#   ./clean-bak-files.sh --dry-run  # 仅预览待删除文件，不执行删除
set -uo pipefail

# 脚本位于 ppocr-web 根目录下，即以脚本所在目录为清理根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

count=0
while IFS= read -r -d '' file; do
  rel="${file#"$PROJECT_ROOT"/}"
  if $DRY_RUN; then
    echo "[预览] $rel"
  else
    if rm -f "$file"; then
      echo "[已删除] $rel"
    else
      echo "[失败]   $rel"
    fi
  fi
  count=$((count + 1))
done < <(find "$PROJECT_ROOT" \
  \( -name .git -o -name node_modules -o -name __pycache__ -o -name .paddlex_cache -o -name .venv -o -name venv -o -name .idea \) -prune -o \
  -type f -name '*.bak_*' -print0)

if [[ $count -eq 0 ]]; then
  echo "未找到 *.bak_* 备份文件，无需清理。"
else
  if $DRY_RUN; then
    echo ""
    echo "共预览到 $count 个 *.bak_* 备份文件。"
  else
    echo ""
    echo "共已删除 $count 个 *.bak_* 备份文件。"
  fi
fi
