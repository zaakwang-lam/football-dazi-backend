# 多阶段构建：第一阶段构建，第二阶段用 Nginx 提供静态文件

# ===== 阶段 1：构建 =====
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# 修改 API base 为生产域名（Cloudflare 配好后改为域名）
# 灰度期先用 IP
ARG API_BASE=http://43.136.84.244
ENV VITE_API_BASE=$API_BASE

RUN npm run build

# ===== 阶段 2：Nginx 提供静态文件 =====
FROM nginx:alpine

# 复制构建产物到 Nginx 静态目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 配置 Nginx
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location /api/ { \
        proxy_pass http://football-backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80