FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Install system dependencies (enhanced - with Chinese font and browser automation support)
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      # Base packages
      ${OPENCLAW_DOCKER_APT_PACKAGES} \
      # Permission management tools
      gosu \
      tini \
      # Chinese font support
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      fonts-liberation \
      # Browser automation support (optional)
      chromium \
      # Utility tools
      bash \
      ca-certificates \
      curl \
      git \
      jq \
      python3 \
      socat \
      websockify && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Configure browser environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Create OpenClaw config directory and set permissions
RUN mkdir -p /home/node/.openclaw/workspace && \
    chown -R node:node /home/node

# Copy and setup initialization script
COPY init.sh /usr/local/bin/init.sh
RUN chmod +x /usr/local/bin/init.sh

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
# Note: init.sh will handle user switching with gosu if running as root
USER root

# Start gateway server with intelligent initialization.
# The init.sh script will:
#   1. Auto-fix permissions if needed
#   2. Generate openclaw.json from environment variables
#   3. Switch to node user and start gateway
#   4. Handle graceful shutdown signals
#
# For container platforms requiring external health checks:
#   Set OPENCLAW_GATEWAY_TOKEN env var
ENTRYPOINT ["/usr/local/bin/init.sh"]
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured"]
