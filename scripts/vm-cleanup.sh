#!/bin/bash

# --- SmartOps VM Cleanup Script ---
# This script clears unused Docker resources, Bun caches, and temporary files to free up space.

echo "🚀 Starting VM Cleanup..."

# 1. Docker Cleanup
echo "🐳 Clearing Docker resources..."
# Remove stopped containers, unused networks, and dangling images
docker system prune -f
# Remove the build cache (often the largest source of bloat)
docker builder prune -af
# Remove all unused volumes (CAUTION: This might delete data volumes if not in use)
# docker volume prune -f

# 2. Bun Cleanup
if command -v bun &> /dev/null; then
  echo "🍞 Clearing Bun package cache..."
  bun pm cache clean
fi

# 3. System Cleanup (Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "🐧 Clearing system logs and temp files..."
  # Clean journal logs older than 1 day
  sudo journalctl --vacuum-time=1d
  # Clear package manager cache (for Ubuntu/Debian)
  if command -v apt-get &> /dev/null; then
    sudo apt-get clean
  fi
fi

# 4. Check remaining space
echo "📊 Current Disk Usage:"
df -h /

echo "✅ Cleanup complete!"
