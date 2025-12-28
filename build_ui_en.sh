#!/bin/bash

# --- Configuration Area ---
TOOLKIT_DIR="$HOME/ai-toolkit"
UI_PORT=8675
# -------------------------

echo "========================================"
echo "Preparing to build AI-Toolkit UI (Fixed)..."
echo "========================================"

# --- 1. Port Cleanup ---
echo "Checking if port $UI_PORT is occupied..."
PID=$(lsof -t -i:$UI_PORT)
if [ -n "$PID" ]; then
    echo "Stale process found (PID: $PID), terminating..."
    kill -9 $PID
    echo "✅ Old process cleaned up."
else
    echo "✅ Port is free, no stale processes."
fi

cd "$TOOLKIT_DIR/ui" || { echo "Error: Could not find ui directory"; read -p "Press Enter to exit..."; exit 1; }

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found. Please install it first: sudo apt install nodejs npm"
    read -p "Press Enter to exit..."
    exit 1
fi

echo "----------------------------------------"
echo "1. Installing frontend dependencies..."
npm install
echo "----------------------------------------"

# --- 🔥 Critical Fix Step 🔥 ---
echo "2. Generating Prisma database client..."
# This step reads schema.prisma and generates TypeScript definitions, resolving TS2305 errors
npx prisma generate
# -------------------------

echo "----------------------------------------"
echo "3. Starting compilation/build..."
npm run build

echo "========================================"
if [ $? -eq 0 ]; then
    echo "🎉 Build successful! You can now run start_ui_en.sh."
else
    echo "❌ Build failed, please check the error logs above."
fi
echo "========================================"
read -p "Press Enter to close window..."
