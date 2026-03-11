# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies (try pnpm first, fallback to npm)
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install; \
    else \
      npm ci; \
    fi

# Copy source
COPY . .

# Build
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm build; \
    else \
      npm run build; \
    fi

# Production stage
FROM nginx:alpine

# Copy built files (Angular 17+ outputs to browser/ subdirectory)
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create startup script to inject API URL
RUN echo '#!/bin/sh' > /start-nginx.sh && \
    echo 'API_URL=${VITE_API_URL:-/api}' >> /start-nginx.sh && \
    echo 'echo "window.APP_CONFIG = { apiUrl: \"$API_URL\" };" > /usr/share/nginx/html/config.js' >> /start-nginx.sh && \
    echo 'sed -i "s|</head>|<script src=\"/config.js\"></script></head>|" /usr/share/nginx/html/index.html' >> /start-nginx.sh && \
    echo 'exec nginx -g "daemon off;"' >> /start-nginx.sh && \
    chmod +x /start-nginx.sh

EXPOSE 80

CMD ["/start-nginx.sh"]
