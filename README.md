# 财知 · 企业财务智能知识助手

纯前端页面 `index.html`：知识库检索 + DeepSeek 大模型问答。

## 接口

- 知识库 Base：`https://agent.unidt.com/v1`
- 知识库 Key：`dataset-adoZr8SvffoDDlAGZibbdAip`
- 大模型：`https://ai-api.unidtai.com/openapi/llm/compatible-mode/v1/chat/completions`
- 模型：`deepseek/deepseek-v4-flash-vision-exp`
- LLM Key：页面已预置

流程：选知识库 → 提问 → `retrieval` 召回片段 → 流式 chat/completions 生成回答并展示来源。
