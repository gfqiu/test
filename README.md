# 财知 · 企业财务智能知识助手

- PC：`pc.html`（湘财晓助风格；「服务对接 / 知识库」收在右侧高级侧栏）
- 移动端：`mobile.html`（企微智能体风格；不展示配置项，读取 PC 写入的 localStorage）
- 入口：`index.html` 按设备跳转

## 接口

- 知识库：`https://agent.unidt.com/v1` + dataset key
- 大模型：`https://ai-api.unidtai.com/openapi/llm/compatible-mode/v1/chat/completions`
- 模型：`deepseek/deepseek-v4-flash-vision-exp`

相关材料默认收起，点击展开。

## Docker

```bash
export DEPLOY_PORT=8080
export DEPLOY_API_PORT=8081
docker compose up -d
```

前端 nginx 将 `/api/knowledge/`、`/api/llm/` 代理到上游。
