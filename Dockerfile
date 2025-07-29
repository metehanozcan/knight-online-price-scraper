
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

# Install dependencies including Tailwind CSS
RUN npm install

# Copy source code
COPY . .

# Build Tailwind CSS
RUN npx tailwindcss -i ./public/input.css -o ./public/output.css --minify

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create start script
RUN echo '#!/bin/bash\n\
redis-server --daemonize yes --bind 0.0.0.0\n\
sleep 2\n\
pm2-runtime start ecosystem.config.js' > /app/start.sh && \
chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]
