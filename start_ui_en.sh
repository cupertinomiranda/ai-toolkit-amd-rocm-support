#!/bin/bash

# --- Terminal Auto-Adaptation ---
# If not running in WezTerm and WezTerm is installed, relaunch automatically
if [[ "$TERM_PROGRAM" != "WezTerm" ]] && command -v wezterm >/dev/null 2>&1 && [[ -z "$_WEZTERM_RELAUNCHED" ]]; then
    echo "========================================"
    echo "Launching independent WezTerm window, you may close this one..."
    export _WEZTERM_RELAUNCHED=1
    # Use nohup and & to detach WezTerm from current process tree
    nohup wezterm start -- /bin/bash "$0" "$@" >/dev/null 2>&1 &
    # Wait briefly to ensure start
    sleep 0.5
    exit
fi

# --- Configuration Area ---
TOOLKIT_DIR="$HOME/ai-toolkit"
VENV_DIR="$HOME/ai-toolkit/venv"
UI_PORT=8675
# -------------------------

echo "========================================"
echo "Starting AI-Toolkit UI (7900 XTX Optimized)..."
echo "Terminal: ${TERM_PROGRAM:-"Generic Terminal"}"
echo "========================================"

# --- Core Logic: Port Monitoring ---
echo "Checking port $UI_PORT occupancy..."
PID=$(lsof -t -i:$UI_PORT)

if [ -n "$PID" ]; then
    echo "⚠️  Stale service (PID: $PID) found, forcing termination..."
    kill -9 $PID
    sleep 1 # Wait one second to ensure release
    echo "✅ Stale service cleaned up."
else
    echo "✅ Clean environment, ready to start."
fi
# ----------------------------------

# 1. Activate Virtual Environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# 2. Enter UI Directory
cd "$TOOLKIT_DIR/ui" || { echo "Error: Could not find ui directory"; read -p "Press Enter to exit..."; exit 1; }

# 3. Environment Variable Setup (AMD GPU Specific)
export HIP_VISIBLE_DEVICES=0
export HSA_OVERRIDE_GFX_VERSION=11.0.0
# Fix ROCm memory fragmentation for better stability
export PYTORCH_HIP_ALLOC_CONF=expandable_segments:True
# Enable AOTriton experimental acceleration (for RDNA3)
export TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1
# Set Hugging Face model cache directory
export HF_HOME=/home/vater/ai-toolkit/models

# Optional Proxy settings:
# export http_proxy=http://127.0.0.1:7890
# export https_proxy=http://127.0.0.1:7890

# 4. Update Database and Launch
echo "Updating job database..."
npm run update_db

echo "----------------------------------------"
echo "🚀 Service is launching..."
echo "🌍 Access via browser: http://localhost:$UI_PORT"
echo "----------------------------------------"

npm run start

# Keep window persistent until manual closure
read -p "Service stopped. Press Enter to exit..."
