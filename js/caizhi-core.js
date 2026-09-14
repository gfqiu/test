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
    "你是企业内部财务智能知识助手「湘财晓助」。当前默认用户职级为「其他员工」。" +
    "请严格依据用户提供的知识库检索片段组织答案；若片段不足以回答，请明确说明资料不足，不要编造制度条文。" +
    "涉及差旅、招待、费用报销等标准时：只回答「其他员工」职级适用的标准，不要主动列出或对比「领导班子」「中层正副职」等更高职级标准。" +
    "若用户询问「领导班子」或「中层正副职」（含中层正职/副职）的标准，应礼貌说明其当前职级无权限查看，可提示仅能查询本人职级（其他员工）标准；不要泄露具体金额或细则。" +
    "回答使用自然中文，尽量简短精炼，只保留必要信息，避免冗长铺垫、重复说明和客套话。可分点，但禁止输出 Markdown 标记（如 **、#、`、- []、> 等）。不要写“依据：……”或引用“制度第×条”“附录×”“速查表”等出处。不要透露底层模型名称。";

  const SUGGESTIONS = [
    "员工差旅费报销标准",
    "普通业务往来招待标准",
    "固定资产的折旧年限",
    "费用报销有时限要求吗"
  ];

  const USER_RANK = "其他员工";
  const RESTRICTED_RANK_PATTERNS = [
    { name: "领导班子", re: /领导班子/ },
    { name: "中层正副职", re: /中层正副职|中层正职|中层副职|中层干部/ }
  ];

  function detectRestrictedRankAsk(question) {
    const text = String(question || "");
    const hits = [];
    RESTRICTED_RANK_PATTERNS.forEach(function (item) {
      if (item.re.test(text)) hits.push(item.name);
    });
    return hits;
  }

  function buildRankDeniedReply(ranks) {
    const uniq = Array.from(new Set(ranks || []));
    const label = uniq.length ? uniq.join("、") : "该职级";
    const variants = [
      "抱歉，按权限设定，您当前职级为「其他员工」，暂不能查看「" + label + "」的费用报销标准。如需了解，可查询「其他员工」适用标准。",
      "您没有权限查看「" + label + "」相关标准。当前账号按「其他员工」职级开放查询，我只能提供该职级的报销标准说明。",
      "「" + label + "」标准不对当前职级开放。您默认职级是「其他员工」，如需报销标准，请直接问该职级相关内容即可。"
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function buildAskUserPrompt(question, context) {
    return (
      "当前用户职级：其他员工\n" +
      "用户问题：\n" + question + "\n\n" +
      "知识库检索片段：\n" + context + "\n\n" +
      "请基于上述片段作答；若片段无关，请说明资料不足。" +
      "若问题涉及费用报销/差旅/招待等标准，仅说明「其他员工」标准；若用户索要领导班子或中层正副职标准，礼貌告知无权限。" +
      "回答尽量简短，只给关键结论与必要条件，不要冗长展开。不要使用 Markdown（如 **），不要写“依据：制度第×条/附录”等出处。"
    );
  }

  const WEEKDAY_LABEL = { 0: "日", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
  const WEEKDAY_CHAR = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatTripDate(d) {
    const wd = WEEKDAY_LABEL[d.getDay()] || "";
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "（周" + wd + "）";
  }

  function startOfWeekMonday(base) {
    const d = new Date(base);
    d.setHours(12, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function dateOnWeek(monday, weekday) {
    const d = new Date(monday);
    const add = weekday === 0 ? 6 : weekday - 1;
    d.setDate(monday.getDate() + add);
    return d;
  }

  function resolveWeekdayToken(token, baseDate) {
    const m = String(token || "").match(/(下|本)?周([一二三四五六日天])/);
    if (!m) return null;
    const prefix = m[1] || "";
    const weekday = WEEKDAY_CHAR[m[2]];
    if (weekday == null) return null;
    const base = new Date(baseDate || Date.now());
    base.setHours(12, 0, 0, 0);
    let monday = startOfWeekMonday(base);
    if (prefix === "下") {
      monday = new Date(monday);
      monday.setDate(monday.getDate() + 7);
    } else if (!prefix) {
      const candidate = dateOnWeek(monday, weekday);
      if (candidate.getTime() < base.getTime() - 12 * 3600 * 1000) {
        monday = new Date(monday);
        monday.setDate(monday.getDate() + 7);
      }
    }
    return dateOnWeek(monday, weekday);
  }

  function extractTripReason(text) {
    if (/设备检|检修/.test(text)) return "设备检修";
    if (/对接/.test(text)) {
      const m = text.match(/对接([^，,。；;\s]+)/);
      if (m) {
        const raw = m[1];
        if (/设备检|检修/.test(raw)) return "设备检修";
        return raw;
      }
    }
    if (/会议|拜访|培训|验收|调研/.test(text)) {
      const m = text.match(/(会议|拜访|培训|验收|调研)[^，,。；;\s]*/);
      if (m) return m[0];
    }
    return "出差对接";
  }

  function parseTripAssistIntent(question) {
    const q = String(question || "").trim();
    if (!q) return null;
    const destMatch = q.match(/去([\u4e00-\u9fa5A-Za-z0-9]{2,12})/);
    if (!destMatch) return null;
    if (!/周[一二三四五六日天]/.test(q)) return null;
    if (!/(回|返回|返程|回来)/.test(q) && !(/周[一二三四五六日天].*周[一二三四五六日天]/.test(q))) return null;

    const startTokenMatch = q.match(/(下|本)?周[一二三四五六日天]/);
    const endTokenMatch = q.match(/(?:，|,|。)?(?:于)?((?:下|本)?周[一二三四五六日天])\s*(?:回|返回|返程|回来)/) ||
      q.match(/((?:下|本)?周[一二三四五六日天])(?!.*周[一二三四五六日天])/);

    const startDate = resolveWeekdayToken(startTokenMatch && startTokenMatch[0], new Date());
    let endDate = null;
    if (endTokenMatch) {
      const endTok = endTokenMatch[1] || endTokenMatch[0];
      if (/^周/.test(endTok) && startDate) {
        endDate = dateOnWeek(startOfWeekMonday(startDate), WEEKDAY_CHAR[endTok.replace(/^周/, "")]);
      } else {
        endDate = resolveWeekdayToken(endTok, startDate || new Date());
      }
    }
    if (!startDate || !endDate) return null;
    if (endDate.getTime() < startDate.getTime()) {
      endDate = new Date(endDate);
      endDate.setDate(endDate.getDate() + 7);
    }

    const nights = Math.max(0, Math.round((endDate - startDate) / (24 * 3600 * 1000)));
    const destination = destMatch[1].replace(/对接.*/, "").replace(/市$/, "") || destMatch[1];
    return {
      destination: destination,
      startDate: startDate,
      endDate: endDate,
      nights: nights,
      reason: extractTripReason(q),
      origin: "湘潭",
      railClass: "高铁二等座",
      hotelRate: 400
    };
  }

  function buildTripExpenseLines(trip) {
    const nights = trip.nights || 0;
    return [
      "去程 " + trip.railClass,
      "返程 " + trip.railClass,
      "住宿 " + nights + " 晚 × ¥" + trip.hotelRate + "/晚",
      "市内交通及餐补（按一般员工标准）"
    ];
  }

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


  function polishAnswer(text) {
    var s = String(text || "");
    s = s.replace(/\*\*/g, "");
    s = s.replace(/__/g, "");
    s = s.replace(/`+/g, "");
    s = s.replace(/^#{1,6}\s+/gm, "");
    s = s.replace(/^\s*>\s?/gm, "");
    s = s.replace(/^\s*[-*+]\s+/gm, "• ");
    s = s.replace(/（[^）]*依据[^）]*）/g, "");
    s = s.replace(/\([^)]*依据[^)]*\)/g, "");
    s = s.replace(/依据[：:][^\n。；;]*[。；;]?/g, "");
    s = s.replace(/（[^）]*(?:第\s*\d+\s*条|附录\s*[A-Za-z0-9]+)[^）]*）/g, "");
    s = s.replace(/\([^)]*(?:第\s*\d+\s*条|附录\s*[A-Za-z0-9]+)[^)]*\)/g, "");
    s = s.replace(/（\s*见?(?:制度|办法|规定|附录|附件)[^）]*）/g, "");
    s = s.replace(/(^|[\s，、；;])\*([^*\n]+)\*(?=[\s，、。；;]|$)/g, "$1$2");
    s = s.replace(/[ \t]+\n/g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    s = s.replace(/[ \t]{2,}/g, " ");
    return s.trim();
  }

  Object.assign(global.Caizhi = global.Caizhi || {}, {
    SUGGESTIONS: SUGGESTIONS,
    DEFAULT_API_BASE: DEFAULT_API_BASE,
    DEFAULT_API_KEY: DEFAULT_API_KEY,
    LLM_MODEL: LLM_MODEL,
    USER_RANK: USER_RANK,
    normalizeBase: normalizeBase,
    readConfig: readConfig,
    writeConfig: writeConfig,
    listDatasets: listDatasets,
    retrieve: retrieve,
    buildContext: buildContext,
    streamLLM: streamLLM,
    LLM_SYSTEM: LLM_SYSTEM,
    polishAnswer: polishAnswer,
    detectRestrictedRankAsk: detectRestrictedRankAsk,
    buildRankDeniedReply: buildRankDeniedReply,
    buildAskUserPrompt: buildAskUserPrompt,
    parseTripAssistIntent: parseTripAssistIntent,
    formatTripDate: formatTripDate,
    buildTripExpenseLines: buildTripExpenseLines,
    renderCollapsedSources: renderCollapsedSources,
    sourceTitle: sourceTitle
  });
  // 兼容裸标识符与显式 window 访问
  try { window.Caizhi = global.Caizhi; } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
