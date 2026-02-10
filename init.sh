#!/bin/bash

set -e

echo "=== OpenClaw Initialization ==="

OPENCLAW_HOME="/home/node/.openclaw"
OPENCLAW_WORKSPACE="${WORKSPACE:-/home/node/.openclaw/workspace}"
NODE_UID="$(id -u node)"
NODE_GID="$(id -g node)"

# Create necessary directories
mkdir -p "$OPENCLAW_HOME" "$OPENCLAW_WORKSPACE"

# Pre-check mounted volume permissions (avoid occasional Permission denied errors)
if [ "$(id -u)" -eq 0 ]; then
    CURRENT_OWNER="$(stat -c '%u:%g' "$OPENCLAW_HOME" 2>/dev/null || echo unknown:unknown)"
    echo "Home directory: $OPENCLAW_HOME"
    echo "Current owner (UID:GID): $CURRENT_OWNER"
    echo "Target owner (UID:GID): ${NODE_UID}:${NODE_GID}"

    if [ "$CURRENT_OWNER" != "${NODE_UID}:${NODE_GID}" ]; then
        echo "Detected host mount directory owner mismatch, attempting auto-fix..."
        chown -R node:node "$OPENCLAW_HOME" || true
    fi

    # Verify write permission again, provide clear diagnosis if failed
    if ! gosu node test -w "$OPENCLAW_HOME"; then
        echo "❌ Permission check failed: node user cannot write to $OPENCLAW_HOME"
        echo "Please run on host (Linux):"
        echo "  sudo chown -R ${NODE_UID}:${NODE_GID} <your-openclaw-data-dir>"
        echo "Or explicitly specify user at startup:"
        echo "  docker run --user \$(id -u):\$(id -g) ..."
        echo "If host has SELinux enabled, add :z or :Z after mount volume"
        exit 1
    fi
fi

# Check if config file exists, generate if not
if [ ! -f /home/node/.openclaw/openclaw.json ]; then
    echo "Generating configuration file..."
    
    # Read configuration parameters from environment variables
    MODEL_ID="${MODEL_ID}"
    BASE_URL="${BASE_URL}"
    API_KEY="${API_KEY}"
    API_PROTOCOL="${API_PROTOCOL:-openai-completions}"
    CONTEXT_WINDOW="${CONTEXT_WINDOW:-200000}"
    MAX_TOKENS="${MAX_TOKENS:-8192}"
    
    TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
    FEISHU_APP_ID="${FEISHU_APP_ID}"
    FEISHU_APP_SECRET="${FEISHU_APP_SECRET}"
    DINGTALK_CLIENT_ID="${DINGTALK_CLIENT_ID}"
    DINGTALK_CLIENT_SECRET="${DINGTALK_CLIENT_SECRET}"
    DINGTALK_ROBOT_CODE="${DINGTALK_ROBOT_CODE:-$DINGTALK_CLIENT_ID}"
    DINGTALK_CORP_ID="${DINGTALK_CORP_ID}"
    DINGTALK_AGENT_ID="${DINGTALK_AGENT_ID}"
    QQBOT_APP_ID="${QQBOT_APP_ID}"
    QQBOT_CLIENT_SECRET="${QQBOT_CLIENT_SECRET}"
    WECOM_TOKEN="${WECOM_TOKEN}"
    WECOM_ENCODING_AES_KEY="${WECOM_ENCODING_AES_KEY}"
    WORKSPACE="${WORKSPACE}"
    OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
    OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
    OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}"
    
    # Generate configuration file
    cat > /home/node/.openclaw/openclaw.json <<EOF
{
  "meta": {
    "lastTouchedVersion": "2026.1.29",
    "lastTouchedAt": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  },
  "update": {
    "checkOnStart": false
  },
  "browser": {
    "headless": true,
    "noSandbox": true,
    "defaultProfile": "openclaw",
    "executablePath": "/usr/bin/chromium"
  },
  "models": {
    "mode": "merge",
    "providers": {
      "default": {
        "baseUrl": "$BASE_URL",
        "apiKey": "$API_KEY",
        "api": "$API_PROTOCOL",
        "models": [
          {
            "id": "$MODEL_ID",
            "name": "$MODEL_ID",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": $CONTEXT_WINDOW,
            "maxTokens": $MAX_TOKENS
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "default/$MODEL_ID"
      },
      "imageModel": {
        "primary": "default/$MODEL_ID"
      },
      "workspace": "$WORKSPACE",
      "compaction": {
        "mode": "safeguard"
      },
      "elevatedDefault": "full",
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions",
    "tts": {
      "edge": {
        "voice": "zh-CN-XiaoxiaoNeural"
      }
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "channels": {
EOF

    # Add Telegram configuration (if token provided)
    FIRST_CHANNEL=true
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        cat >> /home/node/.openclaw/openclaw.json <<EOF
    "telegram": {
      "dmPolicy": "pairing",
      "botToken": "$TELEGRAM_BOT_TOKEN",
      "groupPolicy": "allowlist",
      "streamMode": "partial"
    }
EOF
        FIRST_CHANNEL=false
    fi

    # Add Feishu configuration (if APP_ID and APP_SECRET provided)
    if [ -n "$FEISHU_APP_ID" ] && [ -n "$FEISHU_APP_SECRET" ]; then
        if [ "$FIRST_CHANNEL" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
    "feishu": {
      "enabled": true,
      "connectionMode": "websocket",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "requireMention": true,
      "appId": "$FEISHU_APP_ID",
      "appSecret": "$FEISHU_APP_SECRET"
    }
EOF
        FIRST_CHANNEL=false
    fi

    # Add DingTalk configuration (if CLIENT_ID and CLIENT_SECRET provided)
    if [ -n "$DINGTALK_CLIENT_ID" ] && [ -n "$DINGTALK_CLIENT_SECRET" ]; then
        if [ "$FIRST_CHANNEL" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
    "dingtalk": {
      "enabled": true,
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "robotCode": "$DINGTALK_ROBOT_CODE",
      "corpId": "$DINGTALK_CORP_ID",
      "agentId": "$DINGTALK_AGENT_ID",
      "dmPolicy": "open",
      "groupPolicy": "open",
      "messageType": "markdown",
      "debug": false
    }
EOF
        FIRST_CHANNEL=false
    fi

    # Add QQ Bot configuration (if APP_ID and CLIENT_SECRET provided)
    if [ -n "$QQBOT_APP_ID" ] && [ -n "$QQBOT_CLIENT_SECRET" ]; then
        if [ "$FIRST_CHANNEL" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
    "qqbot": {
      "enabled": true,
      "appId": "$QQBOT_APP_ID",
      "clientSecret": "$QQBOT_CLIENT_SECRET"
    }
EOF
        FIRST_CHANNEL=false
    fi

    # Add WeCom configuration (if required parameters provided)
    if [ -n "$WECOM_TOKEN" ] && [ -n "$WECOM_ENCODING_AES_KEY" ]; then
        if [ "$FIRST_CHANNEL" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
    "wecom": {
      "enabled": true,
      "token": "$WECOM_TOKEN",
      "encodingAesKey": "$WECOM_ENCODING_AES_KEY",
      "commands": {
        "enabled": true,
        "allowlist": ["/new", "/status", "/help", "/compact"]
      }
    }
EOF
    fi

    # Close channels object
    cat >> /home/node/.openclaw/openclaw.json <<EOF
  },
  "gateway": {
    "port": $OPENCLAW_GATEWAY_PORT,
    "mode": "local",
    "bind": "$OPENCLAW_GATEWAY_BIND",
    "controlUi": {
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    }
  },
  "plugins": {
    "entries": {
EOF

    # Add plugin configurations
    FIRST_PLUGIN=true
    
    # Telegram plugin
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        cat >> /home/node/.openclaw/openclaw.json <<EOF
      "telegram": {
        "enabled": true
      }
EOF
        FIRST_PLUGIN=false
    fi

    # Feishu plugin
    if [ -n "$FEISHU_APP_ID" ] && [ -n "$FEISHU_APP_SECRET" ]; then
        if [ "$FIRST_PLUGIN" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
      "feishu": {
        "enabled": true
      }
EOF
        FIRST_PLUGIN=false
    fi

    # DingTalk plugin
    if [ -n "$DINGTALK_CLIENT_ID" ] && [ -n "$DINGTALK_CLIENT_SECRET" ]; then
        if [ "$FIRST_PLUGIN" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
      "dingtalk": {
        "enabled": true
      }
EOF
        FIRST_PLUGIN=false
    fi

    # QQ Bot plugin
    if [ -n "$QQBOT_APP_ID" ] && [ -n "$QQBOT_CLIENT_SECRET" ]; then
        if [ "$FIRST_PLUGIN" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
      "qqbot": {
        "enabled": true
      }
EOF
        FIRST_PLUGIN=false
    fi

    # WeCom plugin
    if [ -n "$WECOM_TOKEN" ] && [ -n "$WECOM_ENCODING_AES_KEY" ]; then
        if [ "$FIRST_PLUGIN" = false ]; then
            echo "," >> /home/node/.openclaw/openclaw.json
        fi
        cat >> /home/node/.openclaw/openclaw.json <<EOF
      "wecom": {
        "enabled": true
      }
EOF
    fi

    # Close entries and plugins objects
    cat >> /home/node/.openclaw/openclaw.json <<EOF
    },
    "installs": {}
  }
}
EOF

    chown node:node /home/node/.openclaw/openclaw.json
else
    echo "Configuration file already exists, skipping generation"
fi

# Graceful shutdown handler
shutdown() {
    echo "Received shutdown signal, gracefully stopping..."
    if [ -n "$GATEWAY_PID" ]; then
        kill -TERM "$GATEWAY_PID" 2>/dev/null || true
        wait "$GATEWAY_PID" 2>/dev/null || true
    fi
    exit 0
}

trap shutdown SIGTERM SIGINT SIGQUIT

# Switch to node user and start gateway
echo "Starting OpenClaw Gateway..."
if [ "$(id -u)" -eq 0 ]; then
    exec gosu node "$@" &
else
    exec "$@" &
fi

GATEWAY_PID=$!
wait "$GATEWAY_PID"
