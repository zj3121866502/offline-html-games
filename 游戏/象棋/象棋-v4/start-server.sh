#!/bin/bash
cd "$(dirname "$0")"

# 确保 Pikafish Linux 引擎有执行权限
PIKAFISH_DIR="pikafish-engine"
if [ -f "$PIKAFISH_DIR/Pikafish-Linux-x86-64-universal" ]; then
  chmod +x "$PIKAFISH_DIR/Pikafish-Linux-x86-64-universal"
fi

echo "Starting Pikafish Bridge Server..."
echo "Open browser: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop"
echo ""
python3 pikafish-bridge.py 8080
