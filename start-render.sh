#!/bin/bash

# 1. 动态注入中转站和自定义模型配置
# 底层依赖基于我们传进来的 ENV 变量
bun run src/cli.ts config set openai.api_key "$PROXY_API_KEY"
bun run src/cli.ts config set openai.base_url "$PROXY_BASE_URL"

# 如果你想用自定义生成模型和向量模型，解除下面两行的注释并修改
bun run src/cli.ts config set default_model "openai:mistralai/mistral-medium-3.5-128b"
bun run src/cli.ts config set embedding_model "openai:text-embedding-3-small"

# 2. 初始化/更新数据库表结构（防呆设计，无脑跑就对了）
echo "Applying database migrations..."
bun run src/cli.ts apply-migrations

# 3. 启动后台 Worker 进程 (负责抓取、生成向量图谱等，使用 & 挂在后台)
echo "Starting background minions..."
bun run src/cli.ts jobs work &

# 4. 前台启动 HTTP MCP server (必须绑定 Render 分配的端口变量 $PORT)
echo "Starting HTTP MCP Server..."
bun run src/cli.ts serve --http --port $PORT