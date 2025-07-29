
#!/bin/bash

# Start Redis server
redis-server --daemonize yes --bind 0.0.0.0 --port 6379

# Wait for Redis to start
sleep 3

# Build CSS if not built
if [ ! -f "./public/output.css" ]; then
    echo "Building Tailwind CSS..."
    npx tailwindcss -i ./public/input.css -o ./public/output.css --minify
fi

# Start the application with PM2
echo "Starting application..."
pm2-runtime start ecosystem.config.js
