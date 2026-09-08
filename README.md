# 财知 · 企业财务智能知识助手

纯前端页面 `index.html`，对接知识库 Service API。

## 接口

- API Base：`https://agent.unidt.com/v1`（`http://agent.unidt.com/v1` 会跳转 HTTPS 并丢失鉴权头，页面已自动升为 https）
- API-Key：`dataset-adoZr8SvffoDDlAGZibbdAip`（页面已预置）

打开 `index.html` 后会自动连接知识库列表；勾选知识库即可提问。支持单库检索与多库检索。

本地 mock（可选）：

```bash
python3 mock_knowledge_api.py
```
