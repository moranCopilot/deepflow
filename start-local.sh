#!/bin/bash
# Script to start DeepFlow locally using specific Node path

NODE_BIN="/usr/local/Cellar/node/25.2.1/bin/node"

if [ ! -f "$NODE_BIN" ]; then
    echo "❌ Node binary not found at $NODE_BIN"
    echo "Please update NODE_BIN in this script to your node executable path."
    exit 1
fi

echo "🚀 Starting DeepFlow..."

# Start Backend
echo "Starting Backend on port 3000..."
"$NODE_BIN" node_modules/tsx/dist/cli.mjs server/index.ts &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend on port 5173..."
"$NODE_BIN" node_modules/vite/bin/vite.js --host 127.0.0.1 &
FRONTEND_PID=$!

# Handle shutdown
cleanup() {
    echo "Stopping processes..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup SIGINT

# Wait for processes
wait
