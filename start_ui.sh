#!/bin/bash

# --- 终端自适应逻辑 ---
# 如果不是在 WezTerm 中运行且系统中安装了 WezTerm，则自动重连
if [[ "$TERM_PROGRAM" != "WezTerm" ]] && command -v wezterm >/dev/null 2>&1 && [[ -z "$_WEZTERM_RELAUNCHED" ]]; then
    echo "========================================"
    echo "正在拉起独立的 WezTerm 窗口，您可以关闭此窗口..."
    export _WEZTERM_RELAUNCHED=1
    # 使用 nohup 和 & 让 WezTerm 彻底脱离当前进程树
    nohup wezterm start -- /bin/bash "$0" "$@" >/dev/null 2>&1 &
    # 等待一秒确保进程启动
    sleep 0.5
    exit
fi

# --- 配置区域 ---
TOOLKIT_DIR="$HOME/ai-toolkit"
VENV_DIR="$HOME/ai-toolkit/venv"
UI_PORT=8675
# ----------------

echo "========================================"
echo "正在启动 AI-Toolkit UI (7900 XTX)..."
echo "运行终端: ${TERM_PROGRAM:-"通用终端"}"
echo "========================================"

# --- 核心逻辑：检查并清理端口 ---
echo "正在检查端口 $UI_PORT 占用情况..."
PID=$(lsof -t -i:$UI_PORT)

if [ -n "$PID" ]; then
    echo "⚠️ 发现旧服务 (PID: $PID) 未关闭，正在强制结束..."
    kill -9 $PID
    sleep 1 # 等待一秒确保释放
    echo "✅ 旧服务已清理。"
else
    echo "✅ 环境干净，准备启动。"
fi
# ------------------------------

# 1. 激活虚拟环境
echo "正在激活虚拟环境..."
source "$VENV_DIR/bin/activate"

# 2. 进入 UI 目录
cd "$TOOLKIT_DIR/ui" || { echo "错误: 找不到 ui 目录"; read -p "按回车退出..."; exit 1; }

# 3. 环境变量设置 (AMD 显卡专用)
export HIP_VISIBLE_DEVICES=0
export HSA_OVERRIDE_GFX_VERSION=11.0.0
# 解决 ROCm 内存碎片问题，提升训练稳定性
export PYTORCH_HIP_ALLOC_CONF=expandable_segments:True
# 开启 AOTriton 实验性加速 (针对 RDNA3)
export TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1
# 设置 Hugging Face 模型缓存目录
export HF_HOME=/home/vater/ai-toolkit/models
# 开启显存碎片管理自动优化
# export PYTORCH_HIP_ALLOC_CONF="expandable_segments:True"
# 如果你需要代理，请取消注释下面两行：
# export http_proxy=http://127.0.0.1:7890
# export https_proxy=http://127.0.0.1:7890

# 4. 更新数据库并启动
echo "正在更新任务数据库..."
npm run update_db

echo "----------------------------------------"
echo "🚀 服务正在启动..."
echo "🌍 浏览器访问地址: http://localhost:$UI_PORT"
echo "----------------------------------------"

npm run start

# 保持窗口开启，直到用户手动关闭
read -p "服务已停止。按回车键退出..."
