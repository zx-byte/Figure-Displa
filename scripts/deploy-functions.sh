#!/usr/bin/env bash
# 批量部署云函数
#
# 用法：
#   bash scripts/deploy-functions.sh <环境ID>
#   bash scripts/deploy-functions.sh shiguang-prod-0gk1a2b3c4d5e6
#
# 前置条件：
#   1. 微信开发者工具已登录，且「设置 → 安全设置 → 服务端口」已打开
#   2. 云开发环境已创建
#
# 说明：使用 --remote-npm-install，依赖在云端安装，不上传本地 node_modules。

set -u

ENV_ID="${1:-}"

if [ -z "$ENV_ID" ]; then
  echo "用法: bash scripts/deploy-functions.sh <环境ID>"
  echo "示例: bash scripts/deploy-functions.sh shiguang-prod-0gk1a2b3c4d5e6"
  echo ""
  echo "环境 ID 可在开发者工具「云开发」控制台顶部的环境下拉框中查看。"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CLI="/c/Program Files (x86)/Tencent/微信web开发者工具/cli.bat"
if [ ! -f "$CLI" ]; then
  echo "✗ 未找到开发者工具 CLI"
  echo "  期望路径: $CLI"
  echo "  请确认开发者工具安装在默认位置，或修改本脚本中的 CLI 变量"
  exit 1
fi

# CLI 是 Windows 批处理，项目路径需要 Windows 格式
if command -v cygpath >/dev/null 2>&1; then
  PROJECT_WIN="$(cygpath -w "$PROJECT_DIR")"
else
  PROJECT_WIN="$PROJECT_DIR"
fi

FUNCTIONS=(login product order pay custom address favorite admin stats initdb)
TOTAL=${#FUNCTIONS[@]}

echo "================================================"
echo " 云函数批量部署"
echo "================================================"
echo " 环境   : $ENV_ID"
echo " 项目   : $PROJECT_WIN"
echo " 函数   : $TOTAL 个"
echo " 依赖   : 云端安装"
echo "================================================"
echo ""

SUCCESS=0
FAILED_LIST=()

for i in "${!FUNCTIONS[@]}"; do
  fn="${FUNCTIONS[$i]}"
  idx=$((i + 1))
  printf "[%2d/%d] %-10s " "$idx" "$TOTAL" "$fn"

  OUT="$("$CLI" cloud functions deploy \
    --env "$ENV_ID" \
    --names "$fn" \
    --project "$PROJECT_WIN" \
    --remote-npm-install 2>&1)"

  # 成功时 CLI 输出包含 √ 或 deploy success；失败会带 error / ×
  if echo "$OUT" | grep -qiE "deploy success|部署成功|√ deploy"; then
    echo "✓"
    SUCCESS=$((SUCCESS + 1))
  elif echo "$OUT" | grep -qiE "\[error\]|× deploy|fail"; then
    echo "✗"
    FAILED_LIST+=("$fn")
    echo "$OUT" | grep -iE "\[error\]|× deploy" | head -2 | sed 's/^/         /'
  else
    # 输出形态不确定时，只要没有明确报错就按成功计
    echo "✓"
    SUCCESS=$((SUCCESS + 1))
  fi
done

echo ""
echo "================================================"
echo " 完成：成功 $SUCCESS / $TOTAL"
if [ ${#FAILED_LIST[@]} -gt 0 ]; then
  echo " 失败：${FAILED_LIST[*]}"
  echo ""
  echo " 失败项可在开发者工具里手动重传："
  echo "   cloudfunctions/<函数名> 右键 → 上传并部署 → 云端安装依赖"
fi
echo "================================================"
echo ""
echo "下一步："
echo "  1. 云开发控制台 → 云函数 → 确认 $TOTAL 个函数状态为「正常」"
echo "  2. 为 initdb 配置环境变量 INIT_TOKEN，然后调用它初始化数据库"
echo "  3. 完整流程见 docs/云开发配置指南.md 第四、五步"
