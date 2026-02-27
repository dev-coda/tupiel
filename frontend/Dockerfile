# Build stage - force x86_64 platform for AWS App Runner
FROM --platform=linux/amd64 node:20-alpine AS builder

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

# Production stage - force x86_64 platform
FROM --platform=linux/amd64 nginx:alpine

# Copy built files
COPY --from=builder /app/dist/frontend /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create entrypoint script to inject API URL
RUN echo '#!/bin/sh' > /docker-entrypoint.d/99-inject-api-url.sh && \
    echo 'if [ ! -z "$VITE_API_URL" ]; then' >> /docker-entrypoint.d/99-inject-api-url.sh && \
    echo '  sed -i "s|window.APP_CONFIG = { apiUrl:.*}|window.APP_CONFIG = { apiUrl: \"$VITE_API_URL\" }|g" /usr/share/nginx/html/index.html || true' >> /docker-entrypoint.d/99-inject-api-url.sh && \
    echo '  sed -i "s|<script>|\\n<script>window.APP_CONFIG = { apiUrl: \"$VITE_API_URL\" };|g" /usr/share/nginx/html/index.html || true' >> /docker-entrypoint.d/99-inject-api-url.sh && \
    echo 'fi' >> /docker-entrypoint.d/99-inject-api-url.sh && \
    chmod +x /docker-entrypoint.d/99-inject-api-url.sh

EXPOSE 80

CMD ["/bin/sh", "-c", "if [ ! -z \"$VITE_API_URL\" ]; then sed -i \"s|window.APP_CONFIG = { apiUrl:.*}|window.APP_CONFIG = { apiUrl: \\\"$VITE_API_URL\\\" }|g\" /usr/share/nginx/html/index.html || sed -i \"s|<head>|<head>\\n  <script>window.APP_CONFIG = { apiUrl: \\\"$VITE_API_URL\\\" };</script>|g\" /usr/share/nginx/html/index.html; fi && nginx -g 'daemon off;'"]
