#!/bin/bash
set -e

# Path to the pi-coding-agent package
PI_PKG_DIR="/usr/local/lib/node_modules/@earendil-works/pi-coding-agent"

# Use node with jiti/register
export NODE_PATH="$PI_PKG_DIR:$PI_PKG_DIR/node_modules"

# Setup symbolic links for imports to work with jiti
mkdir -p node_modules/@earendil-works
ln -sf "$PI_PKG_DIR" node_modules/@earendil-works/pi-coding-agent
ln -sf "$PI_PKG_DIR/node_modules/@earendil-works/pi-ai" node_modules/@earendil-works/pi-ai
ln -sf "$PI_PKG_DIR/node_modules/typebox" node_modules/typebox

echo "Running Pintire extension tests..."
node --import "$PI_PKG_DIR/node_modules/jiti/lib/jiti-register.mjs" pkg/tests/harness.ts
