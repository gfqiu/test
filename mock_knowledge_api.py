#!/usr/bin/env python3
"""Local mock for /v1/knowledge APIs — demo only."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import urllib.parse

DATASET = {
    "id": "4fcaddd9-761e-4cc7-86b3-8e2b5483c022",
    "name": "企业财务制度库",
    "description": "报销、核算、预算、税务 FAQ",
    "document_count": 3,
    "word_count": 12800,
    "provider": "vendor",
    "permission": "only_me",
    "indexing_technique": "high_quality",
    "app_count": 1,
    "created_at": 1775011379,
    "updated_at": 1775011611,
}

CHUNKS = [
    {
        "title": "差旅费报销管理办法.md",
        "content": "差旅费报销须提供：往返交通票据、住宿发票、出差审批单。市内交通可凭网约车电子行程单报销。单次住宿超标需附情况说明并由分管领导签批。",
        "score": 0.91,
    },
    {
        "title": "费用报销审批流程.md",
        "content": "费用报销流程：经办人填报 → 部门负责人审核 → 财务初审 → 分管领导审批（金额≥5000）→ 财务付款。电子发票需查验真伪并附查验截图。",
        "score": 0.86,
    },
    {
        "title": "固定资产核算指引.md",
        "content": "单位价值≥2000元且使用年限超过一年的资产按固定资产入账。折旧采用年限平均法，残值率5%。新增资产当月不提折旧，次月起计提。",
        "score": 0.82,
    },
]


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _auth_ok(self):
        auth = self.headers.get("Authorization", "")
        return auth.startswith("Bearer ") and len(auth) > 8

    def do_GET(self):
        if not self._auth_ok():
            return self._json(401, {"message": "unauthorized"})
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        if path == "/v1/knowledge/datasets":
            return self._json(
                200,
                {
                    "data": [DATASET],
                    "has_more": False,
                    "limit": 20,
                    "total": 1,
                    "page": 1,
                },
            )
        if path == "/v1/knowledge/datasets/retrieval":
            query = (qs.get("query") or [""])[0]
            return self._json(200, self._retrieve(query))
        return self._json(404, {"message": "not found"})

    def do_POST(self):
        if not self._auth_ok():
            return self._json(401, {"message": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}
        path = urllib.parse.urlparse(self.path).path
        if path.endswith("/retrieval") and "/knowledge/datasets/" in path:
            return self._json(200, self._retrieve(payload.get("query") or ""))
        return self._json(404, {"message": "not found"})

    def _retrieve(self, query):
        q = (query or "").lower()
        picked = []
        for c in CHUNKS:
            hit = any(k in q for k in ["差旅", "报销", "票据", "审批", "流程", "固定资产", "折旧", "入账", "预算", "发票", "增值税"])
            if hit or not q:
                picked.append(c)
        if not picked:
            picked = CHUNKS[:1]
        result = []
        for i, c in enumerate(picked[:3]):
            result.append(
                {
                    "title": c["title"],
                    "content": c["content"],
                    "metadata": {
                        "dataset_id": DATASET["id"],
                        "dataset_name": DATASET["name"],
                        "document_name": c["title"],
                        "score": c["score"],
                        "position": i + 1,
                    },
                }
            )
        return {"result": result, "processed_query": query}

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    host, port = "127.0.0.1", 8787
    print(f"mock knowledge api on http://{host}:{port}/v1")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
