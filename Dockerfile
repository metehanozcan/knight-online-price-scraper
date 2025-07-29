FROM node:20-bullseye-slim

# Chromium ve bağımlılıkları kur
RUN apt-get update && apt-get install -y \
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

# PM2'yi yükle
RUN npm install -g pm2

WORKDIR /app

# Puppeteer'ın Chromium indirmesini engelle
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm install

COPY . .

# Puppeteer Chromium yolunu Railway'deki sistem Chromium'u gösterecek şekilde ayarla
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000


EXPOSE 3000
CMD ["pm2-runtime", "ecosystem.config.js"]
