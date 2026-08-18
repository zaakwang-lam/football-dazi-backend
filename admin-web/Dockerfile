# 多阶段构建：构建 Vue 静态资源 + Nginx 提供服务

FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# 生产构建使用相对站点根路径 /admin/
ARG API_BASE=
ENV VITE_API_BASE=$API_BASE

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# base=/admin/：静态资源在 /admin/assets，API 反代到 backend 容器
RUN printf '%s\n' \
  'server {' \
  '    listen 80;' \
  '    server_name _;' \
  '    root /usr/share/nginx/html;' \
  '    index index.html;' \
  '' \
  '    # 登录等 API（容器内直连 backend 服务名）' \
  '    location /api/ {' \
  '        proxy_pass http://backend:3000;' \
  '        proxy_http_version 1.1;' \
  '        proxy_set_header Host $host;' \
  '        proxy_set_header X-Real-IP $remote_addr;' \
  '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '        proxy_set_header X-Forwarded-Proto $scheme;' \
  '        proxy_connect_timeout 10s;' \
  '        proxy_read_timeout 60s;' \
  '    }' \
  '' \
  '    # Vite base=/admin/ 时的资源与路由' \
  '    location /admin/ {' \
  '        alias /usr/share/nginx/html/;' \
  '        try_files $uri $uri/ /admin/index.html;' \
  '    }' \
  '' \
  '    location = /admin {' \
  '        return 301 /admin/;' \
  '    }' \
  '' \
  '    # 兼容直接打开根路径' \
  '    location / {' \
  '        try_files $uri $uri/ /index.html;' \
  '    }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

EXPOSE 80
