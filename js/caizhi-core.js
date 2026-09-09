/* 财知 · 共享逻辑：知识库检索 + DeepSeek 流式问答；配置经 localStorage 双端同步 */
(function (global) {
  const DEFAULT_API_BASE = "https://agent.unidt.com/v1";
  const DEFAULT_API_KEY = "dataset-adoZr8SvffoDDlAGZibbdAip";
  const STORAGE_BASE = "caizhi_api_base";
  const STORAGE_KEY = "caizhi_api_key";
  const STORAGE_SELECTED = "caizhi_selected_ids";
  const STORAGE_METHOD = "caizhi_method";
  const STORAGE_TOPK = "caizhi_topk";
  const STORAGE_THRESHOLD = "caizhi_threshold";

  const LLM_API_URL = "https://ai-api.unidtai.com/openapi/llm/compatible-mode/v1/chat/completions";
  const LLM_API_KEY = "sk-60569506137942a6a2b18b7aedbef8d1";
  const LLM_MODEL = "deepseek/deepseek-v4-flash-vision-exp";
  const LLM_SYSTEM =
    "你是企业内部财务智能知识助手「湘财」。请严格依据用户提供的知识库检索片段回答；" +
    "若片段不足以回答，请明确说明资料不足，不要编造制度条文。回答简洁、分点，使用中文。" +
    "不要透露底层模型名称。";

  const SUGGESTIONS = [
    "差旅费报销需要哪些票据？",
    "费用报销审批流程是怎样的？",
    "固定资产如何入账与折旧？",
    "预算追加需要什么材料？",
    "增值税专用发票如何认证？"
  ];

  function normalizeBase(raw) {
    let base = String(raw || "").trim().replace(/\/+$/, "");
    if (/^http:\/\/agent\.unidt\.com\b/i.test(base)) base = base.replace(/^http:/i, "https:");
    return base;
  }

  function readConfig() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("base") || params.get("api");
    return {
      apiBase: normalizeBase(fromQuery || localStorage.getItem(STORAGE_BASE) || DEFAULT_API_BASE),
      apiKey: localStorage.getItem(STORAGE_KEY) || DEFAULT_API_KEY,
      method: localStorage.getItem(STORAGE_METHOD) || "hybrid_search",
      topK: localStorage.getItem(STORAGE_TOPK) || "3",
      threshold: localStorage.getItem(STORAGE_THRESHOLD) || "0",
      selectedIds: (() => {
        try {
          const arr = JSON.parse(localStorage.getItem(STORAGE_SELECTED) || "[]");
          return Array.isArray(arr) ? arr : [];
        } catch (_) {
          return [];
        }
      })()
    };
  }

  function writeConfig(partial) {
    const cur = readConfig();
    const next = Object.assign({}, cur, partial || {});
    if (partial && partial.apiBase != null) {
      localStorage.setItem(STORAGE_BASE, normalizeBase(partial.apiBase));
    }
    if (partial && partial.apiKey != null) {
      localStorage.setItem(STORAGE_KEY, String(partial.apiKey).trim() || DEFAULT_API_KEY);
    }
    if (partial && partial.method != null) localStorage.setItem(STORAGE_METHOD, partial.method);
    if (partial && partial.topK != null) localStorage.setItem(STORAGE_TOPK, String(partial.topK));
    if (partial && partial.threshold != null) localStorage.setItem(STORAGE_THRESHOLD, String(partial.threshold));
    if (partial && partial.selectedIds != null) {
      localStorage.setItem(STORAGE_SELECTED, JSON.stringify(Array.from(partial.selectedIds)));
    }
    return readConfig();
  }

  async function kbFetch(path, options) {
    const cfg = readConfig();
    const base = normalizeBase(cfg.apiBase);
    if (!base) throw new Error("请先配置 API Base");
    const res = await fetch(base + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + (cfg.apiKey || DEFAULT_API_KEY),
        "Content-Type": "application/json",
        ...(options && options.headers)
      }
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = (data && (data.message || data.errorMsg || data.error || data.detail)) || text || res.statusText;
      throw new Error("HTTP " + res.status + " · " + msg);
    }
    return data;
  }

  async function listDatasets() {
    const data = await kbFetch("/knowledge/datasets?page=1&limit=50");
    return {
      list: Array.isArray(data && data.data) ? data.data : [],
      total: data && data.total
    };
  }

  async function retrieve(query, selectedIds) {
    const cfg = readConfig();
    const ids = selectedIds && selectedIds.length ? selectedIds : cfg.selectedIds;
    if (!ids.length) throw new Error("请至少选择一个知识库（可在 PC 端配置页勾选）");
    const method = cfg.method || "hybrid_search";
    const topK = Math.max(1, parseInt(cfg.topK, 10) || 3);
    const scoreThreshold = Number(cfg.threshold);
    const threshold = Number.isFinite(scoreThreshold) ? scoreThreshold : 0;

    if (ids.length === 1) {
      const data = await kbFetch("/knowledge/datasets/" + encodeURIComponent(ids[0]) + "/retrieval", {
        method: "POST",
        body: JSON.stringify({
          query,
          retrieval_method: method,
          top_k: topK,
          score_threshold: threshold
        })
      });
      return Array.isArray(data && data.result) ? data.result : [];
    }

    const qs = new URLSearchParams();
    ids.forEach((id) => qs.append("dataset_ids", id));
    qs.set("query", query);
    qs.set("retrieval_method", method);
    qs.set("top_k", String(topK));
    qs.set("score_threshold", String(threshold));
    const data = await kbFetch("/knowledge/datasets/retrieval?" + qs.toString(), { method: "GET" });
    return Array.isArray(data && data.result) ? data.result : [];
  }

  function buildContext(results) {
    if (!results || !results.length) return "（未检索到相关片段）";
    return results
      .slice(0, 5)
      .map((r, i) => {
        const title = r.title || (r.metadata && r.metadata.document_name) || "片段 " + (i + 1);
        const body = String(r.content || "").replace(/\s+/g, " ").trim();
        return "[" + (i + 1) + "] " + title + "\n" + (body.length > 1200 ? body.slice(0, 1200) + "…" : body);
      })
      .join("\n\n");
  }

  async function streamLLM(messages, onDelta, signal) {
    const response = await fetch(LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + LLM_API_KEY
      },
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: true }),
      signal
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error("LLM HTTP " + response.status + " · " + errText.slice(0, 240));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta =
            parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
          if (delta) {
            full += delta;
            onDelta(full, delta);
          }
        } catch (_) {}
      }
    }
    return full;
  }

  function sourceTitle(s) {
    return s.title || (s.metadata && s.metadata.document_name) || "文档";
  }

  function sourceScore(s) {
    const score = s.metadata && (s.metadata.rerank_score != null ? s.metadata.rerank_score : s.metadata.score);
    return score != null ? Number(score) : null;
  }

  function renderCollapsedSources(container, sources) {
    if (!sources || !sources.length) return;
    const block = document.createElement("div");
    block.className = "src-block";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "src-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML =
      '<span class="src-toggle-label">相关材料 · ' +
      sources.length +
      ' 份</span><span class="src-chevron">▾</span>';
    const panel = document.createElement("div");
    panel.className = "src-panel";
    panel.hidden = true;
    sources.forEach((s) => {
      const item = document.createElement("div");
      item.className = "src-item";
      const score = sourceScore(s);
      const name = sourceTitle(s);
      const meta = document.createElement("div");
      meta.className = "src-meta";
      const clip = document.createElement("span");
      clip.className = "src-clip";
      clip.textContent = "📎";
      const nameEl = document.createElement("span");
      nameEl.className = "src-name";
      nameEl.textContent = name + (score != null ? " · " + score.toFixed(3) : "");
      meta.appendChild(clip);
      meta.appendChild(nameEl);
      const body = document.createElement("div");
      body.className = "src-body";
      const snippet = String(s.content || "").replace(/\s+/g, " ").trim();
      body.textContent = snippet.length > 280 ? snippet.slice(0, 280) + "…" : snippet;
      item.appendChild(meta);
      item.appendChild(body);
      panel.appendChild(item);
    });
    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.querySelector(".src-chevron").textContent = open ? "▴" : "▾";
    });
    block.appendChild(toggle);
    block.appendChild(panel);
    container.appendChild(block);
  }

  Object.assign(global.Caizhi = global.Caizhi || {}, {
    SUGGESTIONS: SUGGESTIONS,
    DEFAULT_API_BASE: DEFAULT_API_BASE,
    DEFAULT_API_KEY: DEFAULT_API_KEY,
    LLM_MODEL: LLM_MODEL,
    normalizeBase: normalizeBase,
    readConfig: readConfig,
    writeConfig: writeConfig,
    listDatasets: listDatasets,
    retrieve: retrieve,
    buildContext: buildContext,
    streamLLM: streamLLM,
    LLM_SYSTEM: LLM_SYSTEM,
    renderCollapsedSources: renderCollapsedSources,
    sourceTitle: sourceTitle
  });
  // 兼容裸标识符与显式 window 访问
  try { window.Caizhi = global.Caizhi; } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
