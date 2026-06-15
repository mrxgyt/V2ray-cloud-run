#!/bin/sh
# Start V2Ray in background
v2ray run -config /etc/v2ray/config.json &

# Start Node.js panel
cd /app && node panel.js
