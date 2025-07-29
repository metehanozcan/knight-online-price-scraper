FROM node:20-bullseye-slim

# Install Redis server and dependencies
RUN apt-get update && apt-get install -y \
    redis-server \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install PM2 globally
RUN npm install -g pm2

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build Tailwind CSS
RUN npx tailwindcss -i ./public/input.css -o ./public/output.css --minify

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Railway uses PORT environment variable dynamically
# Don't hardcode it

# Create directories for Redis
RUN mkdir -p /var/run/redis /var/log/redis /data && \
    chown -R node:node /var/run/redis /var/log/redis /data

# Switch to non-root user
USER node

# Create start script
RUN echo '#!/bin/bash\n\
echo "Starting Redis..."\n\
redis-server --daemonize yes --bind 127.0.0.1 --dir /data --logfile /var/log/redis/redis.log\n\
sleep 3\n\
echo "Redis started. Starting application..."\n\
exec pm2-runtime start ecosystem.config.js' > /app/start.sh && \
chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]