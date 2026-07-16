(function () {
  const STORE_KEY = "tiktok-ad-mvp-state-v1";
  const PAGE_SIZE = 20;

  const fieldAliases = {
    workId: ["作品 ID"],
    creativeName: ["创意素材"],
    tiktokAccount: ["TikTok 账号"],
    creativeType: ["创意作品类型"],
    videoSource: ["视频来源"],
    status: ["状态"],
    publishTime: ["发布时间"],
    cost: ["成本"],
    skuOrders: ["SKU 订单数"],
    avgOrderCost: ["平均下单成本"],
    revenue: ["总收入"],
    sourceRoi: ["ROI"],
    impressions: ["商品广告曝光数"],
    clicks: ["商品广告点击数"],
    sourceCtr: ["商品广告点击率"],
    sourceConversionRate: ["广告转化率"],
    playRate2s: ["2秒播放率", "广告视频播放达 2 秒播放率"],
    playRate6s: ["6秒播放率", "广告视频播放达 6 秒播放率"],
    playRate25: ["25%播放率", "广告视频播放达 25% 播放率"],
    playRate50: ["50%播放率", "广告视频播放达 50% 播放率"],
    playRate75: ["75%播放率", "广告视频播放达 75% 播放率"],
    completionRate: ["完播率", "广告视频完播率"],
    currency: ["货币"],
  };

  const numericFields = [
    "cost",
    "skuOrders",
    "avgOrderCost",
    "revenue",
    "sourceRoi",
    "impressions",
    "clicks",
    "sourceCtr",
    "sourceConversionRate",
    "playRate2s",
    "playRate6s",
    "playRate25",
    "playRate50",
    "playRate75",
    "completionRate",
  ];

  const rateFields = new Set([
    "sourceCtr",
    "sourceConversionRate",
    "playRate2s",
    "playRate6s",
    "playRate25",
    "playRate50",
    "playRate75",
    "completionRate",
  ]);

  const state = loadState();
  let currentView = "home";
  let currentProductId = null;
  let editingProductId = null;
  let selectedFile = null;
  let materialChart = null;
  const detailUi = {
    range: "all",
    from: "",
    to: "",
    statuses: [],
    search: "",
    sort: "cost_desc",
    page: 1,
  };

  const $ = (id) => document.getElementById(id);

  boot();

  function boot() {
    bindEvents();
    render();
  }

  function bindEvents() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.close));
    });
    $("openProductBtn").addEventListener("click", () => openProductModal());
    $("openUploadBtn").addEventListener("click", () => openUploadModal(currentProductId));
    $("saveProductBtn").addEventListener("click", saveProduct);
    $("fileInput").addEventListener("change", handleFileSelect);
    $("uploadBtn").addEventListener("click", uploadReport);
    $("resetDemoBtn").addEventListener("click", resetData);
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return {
        products: saved.products || [],
        uploads: saved.uploads || [],
        records: saved.records || [],
        auditLogs: saved.auditLogs || [],
      };
    } catch {
      return { products: [], uploads: [], records: [], auditLogs: [] };
    }
  }

  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowText() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function normalizeHeader(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\uFEFF|\u200B/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeLoose(value) {
    return normalizeHeader(value).replace(/\s+/g, "").toLowerCase();
  }

  function parseNumber(value, field) {
    const raw = normalizeHeader(value);
    const text = raw.replace(/[$,%]/g, "").replace(/,/g, "");
    if (!text || text === "-" || text === "—") return 0;
    const num = Number(text);
    if (!Number.isFinite(num)) return 0;
    return rateFields.has(field) && raw.includes("%") ? num / 100 : num;
  }

  function fmtMoney(value) {
    return value == null || !Number.isFinite(value) ? "—" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtNum(value) {
    return value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US");
  }

  function fmtRoi(value) {
    return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
  }

  function fmtPct(value) {
    return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`;
  }

  function safeRatio(a, b) {
    return b ? a / b : null;
  }

  function cpm(cost, impressions) {
    return impressions ? (cost / impressions) * 1000 : null;
  }

  function displayWorkId(workId) {
    return workId === "N/A" ? "商品卡片" : workId;
  }

  function badgeClass(status) {
    if (status === "投放中") return "live";
    if (status === "已排除" || status === "不可用") return "excluded";
    if (status === "学习中" || status === "排队中") return "learning";
    return "";
  }

  function log(action, targetType, targetId, detail) {
    state.auditLogs.unshift({
      id: uid("log"),
      action,
      targetType,
      targetId,
      detail,
      operator: "public-user",
      createdAt: nowText(),
    });
  }

  function switchView(view, productId) {
    currentView = view;
    if (productId !== undefined) currentProductId = productId;
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    render();
  }

  function setTitle(title) {
    $("pageTitle").textContent = title;
  }

  function render() {
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    const viewEl = $(`${currentView}View`);
    if (viewEl) viewEl.classList.add("active");
    updateUploadProductOptions();
    if (currentView === "home") renderHome();
    if (currentView === "detail") renderDetail();
    if (currentView === "reports") renderReports();
    if (currentView === "archived") renderArchived();
    if (currentView === "logs") renderLogs();
  }

  function renderHome() {
    setTitle("广告首页");
    const products = state.products.filter((p) => p.status !== "archived");
    const html = products.length
      ? `<div class="grid product-grid">${products.map(renderProductCard).join("")}</div>`
      : `<div class="empty">还没有广告。先新增一个广告，再上传每日广告数据。</div>`;
    $("homeView").innerHTML = html;
    bindProductCardActions();
  }

  function renderProductCard(product) {
    const summary = getProductSummary(product.id, getActiveRecords(product.id));
    return `
      <article class="card product-card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <small>创建于 ${product.createdAt}</small>
          </div>
          <div class="card-actions">
            <button class="mini-btn" data-action="rename" data-id="${product.id}">改名</button>
            <button class="mini-btn" data-action="archive" data-id="${product.id}">归档</button>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat"><span>素材总数</span><strong>${fmtNum(summary.materialCount)}</strong></div>
          <div class="stat"><span>投放中</span><strong>${fmtNum(summary.liveCount)}</strong></div>
          <div class="stat"><span>总成本</span><strong>${fmtMoney(summary.cost)}</strong></div>
          <div class="stat"><span>总收入</span><strong>${fmtMoney(summary.revenue)}</strong></div>
          <div class="stat"><span>总 ROI</span><strong>${fmtRoi(summary.roi)}</strong></div>
          <div class="stat"><span>最近上传</span><strong>${summary.latestDate || "—"}</strong></div>
        </div>
        <button class="btn secondary" data-action="detail" data-id="${product.id}">进入详情</button>
      </article>
    `;
  }

  function bindProductCardActions() {
    document.querySelectorAll("[data-action][data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const action = button.dataset.action;
        if (action === "detail") {
          currentProductId = id;
          detailUi.page = 1;
          switchView("detail", id);
        }
        if (action === "rename") openProductModal(id);
        if (action === "archive") archiveProduct(id);
        if (action === "restore") restoreProduct(id);
      });
    });
  }

  function renderDetail() {
    const product = state.products.find((p) => p.id === currentProductId);
    if (!product) {
      switchView("home");
      return;
    }
    setTitle(product.name);
    const activeRecords = getActiveRecords(product.id);
    const filteredRecords = filterRecordsByDate(activeRecords, detailUi);
    const summary = getProductSummary(product.id, filteredRecords);
    const materials = getMaterialSummaries(product.id, filteredRecords);
    const statusOptions = [...new Set(materials.map((m) => m.currentStatus).filter(Boolean))].sort();
    const visible = filterSortMaterials(materials);
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    detailUi.page = Math.min(detailUi.page, pageCount);
    const pageRows = visible.slice((detailUi.page - 1) * PAGE_SIZE, detailUi.page * PAGE_SIZE);

    $("detailView").innerHTML = `
      <div class="toolbar">
        <div class="actions">
          <button class="btn ghost" id="backHomeBtn">返回首页</button>
          <button class="btn secondary" id="uploadThisProductBtn">上传该广告日报</button>
          <button class="btn ghost" id="renameThisProductBtn">修改名称</button>
          <button class="btn danger" id="archiveThisProductBtn">归档广告</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="filters">
          <select id="rangeSelect">
            <option value="all">全部历史</option>
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="custom">自定义日期</option>
          </select>
          <input id="fromDate" type="date" value="${detailUi.from}" />
          <input id="toDate" type="date" value="${detailUi.to}" />
        </div>
      </div>
      <div class="metric-row">
        ${metric("素材总数", fmtNum(summary.materialCount))}
        ${metric("总成本", fmtMoney(summary.cost))}
        ${metric("总收入", fmtMoney(summary.revenue))}
        ${metric("总订单", fmtNum(summary.orders))}
        ${metric("整体 ROI", fmtRoi(summary.roi))}
        ${metric("整体 CPM", fmtMoney(summary.cpm))}
        ${metric("投放中数量", fmtNum(summary.liveCount))}
        ${metric("已排除数量", fmtNum(summary.excludedCount))}
      </div>
      <section class="panel">
        <div class="summary-tools">
          <label class="search-box">
            <span>⌕</span>
            <input id="searchInput" type="search" placeholder="输入 ID 或素材名称进行搜索和筛选" value="${escapeAttr(detailUi.search)}" />
          </label>
          <div class="status-chip-row">
            <button class="status-chip ${detailUi.statuses.length === 0 ? "active" : ""}" data-status-chip="all">全部状态</button>
            ${statusOptions.map((s) => `<button class="status-chip ${detailUi.statuses.includes(s) ? "active" : ""}" data-status-chip="${escapeAttr(s)}">${escapeHtml(s)}</button>`).join("")}
          </div>
          <div class="result-count">${fmtNum(visible.length)} 条素材</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sticky-col">作品 ID</th><th>创意素材</th><th>TikTok 账号</th><th>类型</th><th>当前状态</th>
                <th>发布时间</th>${sortableTh("cost", "总成本")}${sortableTh("revenue", "总收入")}${sortableTh("orders", "订单")}${sortableTh("impressions", "曝光")}${sortableTh("clicks", "点击")}
                ${sortableTh("ctr", "点击率")}${sortableTh("conversionRate", "转化率")}${sortableTh("roi", "ROI")}${sortableTh("cpm", "CPM")}<th>投放起始</th><th>最新更新</th>${sortableTh("days", "天数")}<th>查看</th>
              </tr>
            </thead>
            <tbody>
              ${pageRows.map(renderMaterialRow).join("") || `<tr><td colspan="19">没有匹配素材</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button class="mini-btn" id="prevPage">上一页</button>
          <span>第 ${detailUi.page} / ${pageCount} 页</span>
          <button class="mini-btn" id="nextPage">下一页</button>
        </div>
      </section>
    `;

    $("rangeSelect").value = detailUi.range;
    bindDetailEvents(pageCount);
  }

  function metric(label, value) {
    return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function sortableTh(field, label) {
    const [activeField, dir] = detailUi.sort.split("_");
    const active = activeField === field;
    const arrow = active ? (dir === "asc" ? "▲" : "▼") : "↕";
    return `<th><button class="sort-th ${active ? "active" : ""}" data-sort-field="${field}"><span>${label}</span><span class="sort-arrow">${arrow}</span></button></th>`;
  }

  function renderMaterialRow(m) {
    return `
      <tr data-work-id="${escapeAttr(m.workId)}">
        <td class="sticky-col"><strong>${escapeHtml(displayWorkId(m.workId))}</strong></td>
        <td title="${escapeAttr(m.creativeName)}">${escapeHtml(shorten(m.creativeName, 34))}</td>
        <td>${escapeHtml(m.tiktokAccount || "—")}</td>
        <td>${escapeHtml(m.creativeType || "—")}</td>
        <td><span class="badge ${badgeClass(m.currentStatus)}">${escapeHtml(m.currentStatus || "—")}</span></td>
        <td>${escapeHtml(m.publishTime || "—")}</td>
        <td>${fmtMoney(m.cost)}</td>
        <td>${fmtMoney(m.revenue)}</td>
        <td>${fmtNum(m.orders)}</td>
        <td>${fmtNum(m.impressions)}</td>
        <td>${fmtNum(m.clicks)}</td>
        <td>${fmtPct(m.ctr)}</td>
        <td>${fmtPct(m.conversionRate)}</td>
        <td>${fmtRoi(m.roi)}</td>
        <td>${fmtMoney(m.cpm)}</td>
        <td>${m.firstDate}</td>
        <td>${m.lastDate}</td>
        <td>${fmtNum(m.days)}</td>
        <td><button class="mini-btn" data-open-material="${escapeAttr(m.workId)}">趋势</button></td>
      </tr>
    `;
  }

  function bindDetailEvents(pageCount) {
    $("backHomeBtn").addEventListener("click", () => switchView("home"));
    $("uploadThisProductBtn").addEventListener("click", () => openUploadModal(currentProductId));
    $("renameThisProductBtn").addEventListener("click", () => openProductModal(currentProductId));
    $("archiveThisProductBtn").addEventListener("click", () => archiveProduct(currentProductId));
    ["rangeSelect", "fromDate", "toDate", "searchInput"].forEach((id) => {
      $(id).addEventListener("input", (event) => {
        const value = event.target.value;
        if (id === "rangeSelect") detailUi.range = value;
        if (id === "fromDate") detailUi.from = value;
        if (id === "toDate") detailUi.to = value;
        if (id === "searchInput") detailUi.search = value;
        detailUi.page = 1;
        renderDetail();
      });
    });
    document.querySelectorAll("[data-status-chip]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.dataset.statusChip;
        if (status === "all") {
          detailUi.statuses = [];
        } else if (detailUi.statuses.includes(status)) {
          detailUi.statuses = detailUi.statuses.filter((s) => s !== status);
        } else {
          detailUi.statuses = [...detailUi.statuses, status];
        }
        detailUi.page = 1;
        renderDetail();
      });
    });
    document.querySelectorAll("[data-sort-field]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset.sortField;
        const [activeField, dir] = detailUi.sort.split("_");
        const nextDir = activeField === field && dir === "desc" ? "asc" : "desc";
        detailUi.sort = `${field}_${nextDir}`;
        detailUi.page = 1;
        renderDetail();
      });
    });
    $("prevPage").addEventListener("click", () => {
      detailUi.page = Math.max(1, detailUi.page - 1);
      renderDetail();
    });
    $("nextPage").addEventListener("click", () => {
      detailUi.page = Math.min(pageCount, detailUi.page + 1);
      renderDetail();
    });
    document.querySelectorAll("[data-open-material]").forEach((button) => {
      button.addEventListener("click", () => openMaterialModal(button.dataset.openMaterial));
    });
    document.querySelectorAll("tbody tr[data-work-id]").forEach((row) => {
      row.addEventListener("dblclick", () => openMaterialModal(row.dataset.workId));
    });
  }

  function renderReports() {
    setTitle("日报记录");
    const rows = state.uploads
      .filter((u) => !u.deletedAt)
      .slice()
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    $("reportsView").innerHTML = `
      <section class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>广告</th><th>日报日期</th><th>原始文件</th><th>格式</th><th>上传时间</th><th>生效版本</th><th>下载</th><th>删除</th></tr></thead>
            <tbody>
              ${rows.map(renderReportRow).join("") || `<tr><td colspan="8">还没有上传记录</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
    document.querySelectorAll("[data-download]").forEach((button) => {
      button.addEventListener("click", () => downloadUpload(button.dataset.download));
    });
    document.querySelectorAll("[data-delete-upload]").forEach((button) => {
      button.addEventListener("click", () => deleteUpload(button.dataset.deleteUpload));
    });
  }

  function renderReportRow(upload) {
    const product = state.products.find((p) => p.id === upload.productId);
    return `
      <tr>
        <td>${escapeHtml(product?.name || "已删除广告")}</td>
        <td>${upload.reportDate}</td>
        <td>${escapeHtml(upload.originalFilename)}</td>
        <td>${upload.fileType}</td>
        <td>${upload.uploadedAt}</td>
        <td>${upload.isActive ? "是" : "否"}</td>
        <td><button class="mini-btn" data-download="${upload.id}">下载</button></td>
        <td><button class="mini-btn" data-delete-upload="${upload.id}">删除</button></td>
      </tr>
    `;
  }

  function renderArchived() {
    setTitle("已归档广告");
    const products = state.products.filter((p) => p.status === "archived");
    $("archivedView").innerHTML = products.length
      ? `<div class="grid product-grid">${products.map(renderArchivedCard).join("")}</div>`
      : `<div class="empty">暂无已归档广告。</div>`;
    bindProductCardActions();
  }

  function renderArchivedCard(product) {
    const summary = getProductSummary(product.id, getActiveRecords(product.id));
    return `
      <article class="card product-card">
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <small>归档于 ${product.archivedAt || "—"}</small>
        </div>
        <div class="stat-grid">
          <div class="stat"><span>素材总数</span><strong>${fmtNum(summary.materialCount)}</strong></div>
          <div class="stat"><span>总成本</span><strong>${fmtMoney(summary.cost)}</strong></div>
          <div class="stat"><span>总收入</span><strong>${fmtMoney(summary.revenue)}</strong></div>
          <div class="stat"><span>总 ROI</span><strong>${fmtRoi(summary.roi)}</strong></div>
        </div>
        <button class="btn secondary" data-action="restore" data-id="${product.id}">恢复广告</button>
      </article>
    `;
  }

  function renderLogs() {
    setTitle("操作记录");
    $("logsView").innerHTML = `
      <section class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>操作</th><th>对象</th><th>操作者</th><th>详情</th></tr></thead>
            <tbody>
              ${state.auditLogs.map((l) => `
                <tr>
                  <td>${l.createdAt}</td><td>${l.action}</td><td>${l.targetType}</td><td>${l.operator}</td><td>${escapeHtml(l.detail || "")}</td>
                </tr>
              `).join("") || `<tr><td colspan="5">暂无操作记录</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function getActiveRecords(productId) {
    const activeUploadIds = new Set(state.uploads.filter((u) => !u.deletedAt && u.productId === productId && u.isActive).map((u) => u.id));
    return state.records.filter((r) => r.productId === productId && activeUploadIds.has(r.uploadId));
  }

  function getUploadedDates(productId) {
    return [...new Set(state.uploads.filter((u) => !u.deletedAt && u.productId === productId && u.isActive).map((u) => u.reportDate))].sort();
  }

  function filterRecordsByDate(records, ui) {
    if (ui.range === "all") return records;
    const dates = [...new Set(records.map((r) => r.reportDate))].sort();
    if (!dates.length) return records;
    let from = ui.from;
    let to = ui.to;
    if (ui.range === "7" || ui.range === "30") {
      to = dates[dates.length - 1];
      const d = new Date(`${to}T00:00:00`);
      d.setDate(d.getDate() - Number(ui.range) + 1);
      from = d.toISOString().slice(0, 10);
    }
    if (ui.range === "custom" && (!from || !to)) return records;
    return records.filter((r) => (!from || r.reportDate >= from) && (!to || r.reportDate <= to));
  }

  function getProductSummary(productId, records) {
    const materials = getMaterialSummaries(productId, records);
    const cost = records.reduce((s, r) => s + r.cost, 0);
    const revenue = records.reduce((s, r) => s + r.revenue, 0);
    const orders = records.reduce((s, r) => s + r.skuOrders, 0);
    const impressions = records.reduce((s, r) => s + r.impressions, 0);
    const clicks = records.reduce((s, r) => s + r.clicks, 0);
    const uploads = state.uploads.filter((u) => !u.deletedAt && u.productId === productId && u.isActive);
    return {
      materialCount: materials.length,
      liveCount: materials.filter((m) => m.currentStatus === "投放中").length,
      excludedCount: materials.filter((m) => m.currentStatus === "已排除").length,
      cost,
      revenue,
      orders,
      impressions,
      clicks,
      roi: safeRatio(revenue, cost),
      ctr: safeRatio(clicks, impressions),
      conversionRate: safeRatio(orders, clicks),
      cpm: cpm(cost, impressions),
      latestDate: uploads.map((u) => u.reportDate).sort().pop() || "",
    };
  }

  function getMaterialSummaries(productId, scopedRecords) {
    const allRecords = getActiveRecords(productId);
    const productDates = getUploadedDates(productId);
    const latestDate = productDates[productDates.length - 1] || "";
    const lifecycle = new Map();
    allRecords.forEach((r) => {
      if (!lifecycle.has(r.workId)) lifecycle.set(r.workId, []);
      lifecycle.get(r.workId).push(r);
    });
    const scopedByWork = new Map();
    scopedRecords.forEach((r) => {
      if (!scopedByWork.has(r.workId)) scopedByWork.set(r.workId, []);
      scopedByWork.get(r.workId).push(r);
    });
    return [...lifecycle.entries()].map(([workId, lifeRows]) => {
      const rows = scopedByWork.get(workId) || [];
      const latestRow = lifeRows.filter((r) => r.reportDate === latestDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const firstDate = lifeRows.map((r) => r.reportDate).sort()[0];
      const lastDate = lifeRows.map((r) => r.reportDate).sort().pop();
      const displayRow = lifeRows.sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0] || {};
      const cost = rows.reduce((s, r) => s + r.cost, 0);
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const orders = rows.reduce((s, r) => s + r.skuOrders, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      return {
        workId,
        creativeName: displayRow.creativeName || "",
        tiktokAccount: displayRow.tiktokAccount || "",
        creativeType: displayRow.creativeType || "",
        publishTime: displayRow.publishTime || "",
        currentStatus: latestRow ? latestRow.status : "已排除",
        cost,
        revenue,
        orders,
        impressions,
        clicks,
        roi: safeRatio(revenue, cost),
        ctr: safeRatio(clicks, impressions),
        conversionRate: safeRatio(orders, clicks),
        cpm: cpm(cost, impressions),
        firstDate,
        lastDate,
        days: naturalDays(firstDate, lastDate),
      };
    });
  }

  function filterSortMaterials(materials) {
    const search = detailUi.search.trim().toLowerCase();
    const filtered = materials.filter((m) => {
      const statusOk = detailUi.statuses.length === 0 || detailUi.statuses.includes(m.currentStatus);
      const searchOk =
        !search ||
        displayWorkId(m.workId).toLowerCase().includes(search) ||
        m.workId.toLowerCase().includes(search) ||
        (m.creativeName || "").toLowerCase().includes(search);
      return statusOk && searchOk;
    });
    const [field, dir] = detailUi.sort.split("_");
    return filtered.sort((a, b) => {
      const av = a[field] ?? -Infinity;
      const bv = b[field] ?? -Infinity;
      return dir === "asc" ? av - bv : bv - av;
    });
  }

  function naturalDays(from, to) {
    if (!from || !to) return 0;
    const a = new Date(`${from}T00:00:00`);
    const b = new Date(`${to}T00:00:00`);
    return Math.floor((b - a) / 86400000) + 1;
  }

  function openProductModal(productId) {
    editingProductId = productId || null;
    const product = state.products.find((p) => p.id === productId);
    $("productModalTitle").textContent = product ? "修改广告名称" : "新增广告";
    $("productNameInput").value = product?.name || "";
    openModal("productModal");
    $("productNameInput").focus();
  }

  function saveProduct() {
    const name = $("productNameInput").value.trim();
    if (!name) {
      toast("广告名称不能为空");
      return;
    }
    if (editingProductId) {
      const product = state.products.find((p) => p.id === editingProductId);
      const before = product.name;
      product.name = name;
      product.updatedAt = nowText();
      log("修改广告名称", "广告", product.id, `${before} -> ${name}`);
    } else {
      const product = { id: uid("product"), name, status: "active", createdAt: nowText(), updatedAt: nowText(), archivedAt: "" };
      state.products.push(product);
      log("新增广告", "广告", product.id, name);
    }
    persist();
    closeModal("productModal");
    render();
    toast("保存成功");
  }

  function archiveProduct(productId) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    if (!confirm(`确认归档「${product.name}」？历史日报会继续保留。`)) return;
    product.status = "archived";
    product.archivedAt = nowText();
    product.updatedAt = nowText();
    log("归档广告", "广告", product.id, product.name);
    persist();
    currentProductId = null;
    switchView("home");
    toast("广告已归档");
  }

  function restoreProduct(productId) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    product.status = "active";
    product.archivedAt = "";
    product.updatedAt = nowText();
    log("恢复广告", "广告", product.id, product.name);
    persist();
    render();
    toast("广告已恢复");
  }

  function updateUploadProductOptions() {
    const products = state.products.filter((p) => p.status !== "archived");
    $("uploadProductSelect").innerHTML = products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  }

  function openUploadModal(productId) {
    if (!state.products.some((p) => p.status !== "archived")) {
      toast("请先新增广告");
      return;
    }
    updateUploadProductOptions();
    $("uploadProductSelect").value = productId || state.products.find((p) => p.status !== "archived")?.id || "";
    $("uploadDateInput").value = "";
    $("fileInput").value = "";
    $("fileHint").textContent = "支持平台导出的标准素材明细报表";
    $("uploadError").style.display = "none";
    selectedFile = null;
    openModal("uploadModal");
  }

  function handleFileSelect(event) {
    selectedFile = event.target.files[0] || null;
    if (!selectedFile) return;
    $("fileHint").textContent = selectedFile.name;
    const date = (selectedFile.name.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (date) $("uploadDateInput").value = date;
  }

  async function uploadReport() {
    const productId = $("uploadProductSelect").value;
    const reportDate = $("uploadDateInput").value;
    const file = selectedFile;
    showUploadError("");
    if (!productId) return showUploadError("请选择广告");
    if (!file) return showUploadError("请选择上传文件");
    if (!reportDate) return showUploadError("日期无法识别且未手动填写");
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return showUploadError("文件格式不支持");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const parsed = parseWorkbook(workbook, ext);
      const uploadId = uid("upload");
      state.uploads.forEach((u) => {
        if (!u.deletedAt && u.productId === productId && u.reportDate === reportDate) u.isActive = false;
      });
      const fileData = await fileToDataUrl(file);
      state.uploads.push({
        id: uploadId,
        productId,
        reportDate,
        originalFilename: file.name,
        fileType: ext,
        fileData,
        isActive: true,
        uploadedAt: nowText(),
        deletedAt: "",
      });
      state.records.push(...parsed.records.map((record) => ({
        ...record,
        id: uid("record"),
        uploadId,
        productId,
        reportDate,
        calculatedCpm: cpm(record.cost, record.impressions),
        createdAt: nowText(),
      })));
      log("上传日报", "日报", uploadId, `${file.name} / ${reportDate} / ${parsed.records.length} 行`);
      persist();
      closeModal("uploadModal");
      currentProductId = productId;
      currentView = "detail";
      render();
      toast("上传成功");
    } catch (error) {
      showUploadError(error.message || "文件解析失败");
    }
  }

  function parseWorkbook(workbook, ext) {
    let selected = null;
    for (const name of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeLoose(cell) === normalizeLoose("作品 ID")));
      if (headerIndex >= 0) {
        selected = { name, rows, headerIndex };
        break;
      }
    }
    if (!selected) throw new Error(ext === "csv" ? "缺少字段：作品 ID" : "未找到包含“作品 ID”的工作表");
    const header = selected.rows[selected.headerIndex].map(normalizeHeader);
    const headerLoose = header.map(normalizeLoose);
    const mapping = {};
    const missing = [];
    Object.entries(fieldAliases).forEach(([key, aliases]) => {
      const index = aliases.map(normalizeLoose).map((alias) => headerLoose.indexOf(alias)).find((i) => i >= 0);
      if (index == null || index < 0) missing.push(aliases[0]);
      else mapping[key] = index;
    });
    if (missing.length) throw new Error(`缺少字段：${missing.join("、")}`);
    const rows = selected.rows.slice(selected.headerIndex + 1).filter((row) => row.some((cell) => normalizeHeader(cell)));
    if (!rows.length) throw new Error("文件内容为空");

    const seen = new Set();
    const records = rows.map((row, rowIndex) => {
      const get = (key) => normalizeHeader(row[mapping[key]]);
      const workId = get("workId");
      if (!workId) throw new Error(`第 ${rowIndex + selected.headerIndex + 2} 行作品 ID 为空`);
      if (seen.has(workId)) throw new Error(`同一日报内作品 ID 重复：${displayWorkId(workId)}`);
      seen.add(workId);
      const record = {
        workId,
        creativeName: get("creativeName"),
        tiktokAccount: get("tiktokAccount"),
        creativeType: get("creativeType"),
        videoSource: get("videoSource"),
        status: get("status"),
        publishTime: get("publishTime"),
        currency: get("currency") || "USD",
      };
      numericFields.forEach((field) => {
        record[field] = parseNumber(row[mapping[field]], field);
      });
      return record;
    });
    const badCurrency = records.find((r) => r.currency && r.currency !== "USD");
    if (badCurrency) throw new Error("货币必须为 USD");
    return { sheetName: selected.name, records };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("文件上传失败"));
      reader.readAsDataURL(file);
    });
  }

  function showUploadError(message) {
    const box = $("uploadError");
    if (!message) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.style.display = "block";
    box.textContent = message;
  }

  function deleteUpload(uploadId) {
    const upload = state.uploads.find((u) => u.id === uploadId);
    if (!upload || upload.deletedAt) return;
    if (!confirm(`确认删除 ${upload.reportDate} 的日报「${upload.originalFilename}」？`)) return;
    upload.deletedAt = nowText();
    upload.isActive = false;
    state.records = state.records.filter((r) => r.uploadId !== uploadId);
    const candidates = state.uploads
      .filter((u) => !u.deletedAt && u.productId === upload.productId && u.reportDate === upload.reportDate)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    if (candidates[0]) candidates[0].isActive = true;
    log("删除日报", "日报", uploadId, `${upload.originalFilename} / ${upload.reportDate}`);
    persist();
    render();
    toast("日报已删除");
  }

  function downloadUpload(uploadId) {
    const upload = state.uploads.find((u) => u.id === uploadId);
    if (!upload?.fileData) return toast("原始文件不存在");
    const link = document.createElement("a");
    link.href = upload.fileData;
    link.download = upload.originalFilename;
    link.click();
  }

  function openMaterialModal(workId) {
    const product = state.products.find((p) => p.id === currentProductId);
    const records = getActiveRecords(currentProductId);
    const materials = getMaterialSummaries(currentProductId, records);
    const material = materials.find((m) => m.workId === workId);
    if (!material || !product) return;
    const dates = getUploadedDates(currentProductId).filter((date) => date >= material.firstDate && date <= material.lastDate);
    const byDate = new Map(records.filter((r) => r.workId === workId).map((r) => [r.reportDate, r]));
    const dailyRows = dates.map((date) => {
      const row = byDate.get(date);
      return row || {
        reportDate: date,
        status: "已排除",
        cost: 0,
        revenue: 0,
        skuOrders: 0,
        sourceRoi: 0,
        impressions: 0,
        clicks: 0,
        sourceCtr: 0,
        sourceConversionRate: 0,
        calculatedCpm: null,
      };
    });
    $("materialTitle").textContent = `${displayWorkId(workId)} / 素材详情`;
    $("materialBody").innerHTML = `
      <div class="metric-row">
        ${metric("当前状态", `<span class="badge ${badgeClass(material.currentStatus)}">${escapeHtml(material.currentStatus)}</span>`)}
        ${metric("总成本", fmtMoney(material.cost))}
        ${metric("总收入", fmtMoney(material.revenue))}
        ${metric("总订单", fmtNum(material.orders))}
        ${metric("总 ROI", fmtRoi(material.roi))}
        ${metric("总 CPM", fmtMoney(material.cpm))}
        ${metric("点击率", fmtPct(material.ctr))}
        ${metric("转化率", fmtPct(material.conversionRate))}
      </div>
      <div class="panel">
        <p><strong>创意素材：</strong>${escapeHtml(material.creativeName || "—")}</p>
        <p><strong>TikTok 账号：</strong>${escapeHtml(material.tiktokAccount || "—")}　<strong>发布时间：</strong>${escapeHtml(material.publishTime || "—")}　<strong>投放天数：</strong>${fmtNum(material.days)}</p>
      </div>
      <div class="chart-box"><canvas id="materialChart"></canvas></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>状态</th><th>成本</th><th>总收入</th><th>订单</th><th>ROI</th><th>曝光</th><th>点击</th><th>点击率</th><th>转化率</th><th>CPM</th></tr></thead>
          <tbody>
            ${dailyRows.map((r) => `
              <tr>
                <td>${r.reportDate}</td><td><span class="badge ${badgeClass(r.status)}">${escapeHtml(r.status)}</span></td>
                <td>${fmtMoney(r.cost)}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtNum(r.skuOrders)}</td><td>${fmtRoi(r.sourceRoi)}</td>
                <td>${fmtNum(r.impressions)}</td><td>${fmtNum(r.clicks)}</td><td>${fmtPct(safeRatio(r.clicks, r.impressions))}</td><td>${fmtPct(safeRatio(r.skuOrders, r.clicks))}</td><td>${fmtMoney(cpm(r.cost, r.impressions))}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
    openModal("materialModal");
    drawMaterialChart(dailyRows);
  }

  function drawMaterialChart(rows) {
    if (materialChart) materialChart.destroy();
    const ctx = $("materialChart");
    materialChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: rows.map((r) => r.reportDate),
        datasets: [
          { label: "每日成本", data: rows.map((r) => r.cost), borderColor: "#0f766e", backgroundColor: "#0f766e", yAxisID: "money", tension: 0.25 },
          { label: "每日收入", data: rows.map((r) => r.revenue), borderColor: "#c2410c", backgroundColor: "#c2410c", yAxisID: "money", tension: 0.25 },
          { label: "每日 ROI", data: rows.map((r) => r.sourceRoi), borderColor: "#7c3aed", backgroundColor: "#7c3aed", yAxisID: "ratio", tension: 0.25 },
          { label: "每日 CPM", data: rows.map((r) => cpm(r.cost, r.impressions)), borderColor: "#2563eb", backgroundColor: "#2563eb", yAxisID: "money", tension: 0.25 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          money: { type: "linear", position: "left", ticks: { callback: (v) => `$${v}` } },
          ratio: { type: "linear", position: "right", grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function openModal(id) {
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    $(id).classList.remove("open");
    $(id).setAttribute("aria-hidden", "true");
    if (id === "materialModal" && materialChart) {
      materialChart.destroy();
      materialChart = null;
    }
  }

  function resetData() {
    if (!confirm("确认清空当前浏览器里的所有广告、日报和操作记录？")) return;
    state.products = [];
    state.uploads = [];
    state.records = [];
    state.auditLogs = [];
    currentProductId = null;
    currentView = "home";
    persist();
    render();
    toast("本地数据已清空");
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function shorten(value, length) {
    const text = String(value || "—");
    return text.length > length ? `${text.slice(0, length)}...` : text;
  }
})();

