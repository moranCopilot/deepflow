#!/bin/bash

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not found. Please ensure Node.js is installed and in your PATH."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

# Check if concurrently is installed, if not, try to install it locally or use npx
# We use npx to run concurrently without adding it to package.json explicitly if we don't want to modify it,
# but adding it is better.
# Let's just use npx concurrently directly.

echo "🚀 Starting DeepFlow Development Environment..."
echo "   - Backend: http://localhost:3000"
echo "   - Frontend: http://localhost:5173"

# Use npx to run concurrently
# "npm run start" runs "tsx server/index.ts"
# "npm run dev" runs "vite"
npx concurrently -k -n "SERVER,CLIENT" -c "blue,green" "npm run start" "npm run dev"
