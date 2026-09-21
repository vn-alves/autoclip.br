# AutoClip Dockerfile
# 多阶段构建，优化镜像大小

# 第一阶段：构建前端
FROM node:18-slim AS frontend-builder

WORKDIR /app

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# frontend/src/integrations 通过 vite.config.ts 的 @cloud 别名指向仓库根目录的
# src/integrations（云端登录 @lovable.dev/cloud-auth-js、@supabase/supabase-js）。
# Node/Rollup 按该文件自身路径向上查找依赖，只会到达 /app/node_modules，到不了
# /app/frontend/node_modules；只装 frontend 依赖会导致构建报
# "Rollup failed to resolve import"。根 package.json 的 postinstall 会级联安装
# frontend 依赖，所以这里只需要 npm ci 一次。
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY src/ ./src/
RUN npm ci

# 复制前端源代码并构建
COPY frontend/ ./frontend/
RUN npm --prefix frontend run build

# 第二阶段：构建后端
# yt-dlp 已停止支持 Python 3.9（3.9 下 YouTube 提取只能靠 android client 回退，且仅有 360p）
FROM python:3.11-slim AS backend-builder

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 复制Python依赖文件
COPY requirements.txt ./

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 第三阶段：最终镜像
FROM python:3.11-slim

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# 创建非root用户
RUN groupadd -r autoclip && useradd -r -g autoclip autoclip

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 设置工作目录
WORKDIR /app

# 从构建阶段复制文件
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# 复制项目文件
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY *.sh ./
COPY env.example .env
COPY docker-entrypoint.sh ./

# 创建必要的目录
RUN mkdir -p data/projects data/uploads data/temp data/output logs

# 设置权限
RUN chown -R autoclip:autoclip /app
RUN chmod +x *.sh
RUN chmod +x docker-entrypoint.sh
RUN chmod -R 755 data logs

# 切换到非root用户
USER autoclip

# 暴露端口
EXPOSE 8000 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health/ || exit 1

# 启动命令
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
