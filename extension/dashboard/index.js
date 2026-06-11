(function () {
  function escapeHtmlBasic(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function showFatal(msg) {
    const el = document.getElementById("statusText");
    if (el) {
      el.textContent = msg;
      el.classList.add("error");
    }
    const cards = document.getElementById("cards");
    if (cards) {
      cards.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-title" style="color:#dc2626">出错了</div><div style="white-space:pre-wrap;font-size:13px;color:#374151">${escapeHtmlBasic(msg)}</div></div>`;
    }
  }

  if (!window.SegApi) {
    document.addEventListener("DOMContentLoaded", () => {
      showFatal("api.js 未加载（window.SegApi 为空）。请检查扩展是否正确加载。");
    });
    return;
  }

  const {
    PROJECTS, CATEGORY_LABEL,
    getSelectedMembers, mergeSeenMembers, extractMembers, isMemberItem, getOwnerName,
    getSprintNames, isClosedStage, isFinishedStage,
    fetchAllWorkitems, hasCsrfToken, fetchProjects,
    fetchAllTestPlans, getOwnerNames, bootstrapAuth,
  } = window.SegApi;

  const NO_SPRINT = "<无迭代>";
  const ALL = "all";

  const state = {
    category: "All",
    sprint: "",
    finishStatus: ALL,    // 'all' | 'finished' | 'unclosed' | 'cancelled'
    owner: ALL,           // 'all' | 具体某个组员名
    data: {},
    loading: false,
    selectedMembers: [],
    sort: { key: null, dir: 1 },
  };

  const STATUS_BADGE = {
    "已完成": "success", "已修复": "success", "正常结束": "success",
    "已取消": "neutral", "暂不修复": "neutral", "异常结束": "neutral",
    "待处理": "warning", "待确认": "warning", "待内审": "warning", "待验收": "warning", "再次打开": "warning",
    "开发中": "info", "测试中": "info", "设计中": "info", "处理中": "info", "内审通过": "info", "进行中": "info", "未开始": "warning",
    "设计完成": "info", "开发完成": "info", "澄清完成": "info", "已提测": "info",
  };
  function badgeClass(name) { return STATUS_BADGE[name] || "neutral"; }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function getStatusName(it) { return it?.status?.displayName || it?.status?.name || "未知"; }
  function getWorkitemType(it) { return it?.workitemType?.displayName || it?.workitemType?.name || ""; }

  function setStatus(text, isError = false) {
    const el = document.getElementById("statusText");
    el.textContent = text;
    el.classList.toggle("error", isError);
  }

  function escapeHtml(s) { return escapeHtmlBasic(s); }

  // ---------- 渲染 ----------
  function renderCards(perProject) {
    const cards = document.getElementById("cards");
    cards.innerHTML = PROJECTS.map((proj) => {
      const stat = perProject[proj.id] || { total: 0, finished: 0, unclosed: 0 };
      return `
        <div class="card">
          <div class="card-title"><span class="card-title-dot"></span>${proj.name}</div>
          <div class="card-metrics">
            <div class="metric">
              <div class="metric-value">${stat.total}</div>
              <div class="metric-label">总数</div>
            </div>
            <div class="metric success">
              <div class="metric-value">${stat.finished}</div>
              <div class="metric-label">已完成</div>
            </div>
            <div class="metric warning">
              <div class="metric-value">${stat.unclosed}</div>
              <div class="metric-label">未关闭</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderCharts(perProject) {
    const charts = document.getElementById("charts");
    charts.innerHTML = PROJECTS.map((proj) => {
      const dist = perProject[proj.id]?.statusDist || {};
      const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
      const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
      if (entries.length === 0) {
        return `<div class="chart-block"><h3>${escapeHtml(proj.name)}</h3><div class="empty">暂无数据</div></div>`;
      }
      const total = entries.reduce((s, [, v]) => s + v, 0);
      const rows = entries
        .map(([name, count]) => {
          const pct = (count / max) * 100;
          const fillCls = badgeClass(name) === "neutral" ? "" : badgeClass(name);
          return `
            <div class="bar-row" title="${escapeHtml(name)}: ${count}">
              <div class="bar-label">${escapeHtml(name)}</div>
              <div class="bar-track"><div class="bar-fill ${fillCls}" style="width:${pct}%"></div></div>
              <div class="bar-count">${count}</div>
            </div>
          `;
        })
        .join("");
      return `<div class="chart-block"><h3>${escapeHtml(proj.name)}<span class="total">共 ${total}</span></h3>${rows}</div>`;
    }).join("");
  }

  function renderTable(rows) {
    const tbody = document.querySelector("#detailTable tbody");
    const summary = document.getElementById("tableSummary");
    summary.textContent = `共 ${rows.length} 条`;

    document.querySelectorAll("#detailTable th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      const ind = th.querySelector(".sort-indicator");
      if (state.sort.key && th.dataset.key === state.sort.key) {
        th.classList.add(state.sort.dir === 1 ? "sorted-asc" : "sorted-desc");
        if (ind) ind.textContent = state.sort.dir === 1 ? "↑" : "↓";
      } else {
        if (ind) ind.textContent = "↕";
      }
    });

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">没有符合条件的工作项</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr class="${r.url ? "row-link" : ""}" ${r.url ? `data-url="${escapeHtml(r.url)}"` : ""} title="${r.url ? "点击在新标签页打开工作项" : ""}">
          <td>${escapeHtml(r.projectName)}</td>
          <td class="col-id">${escapeHtml(r.serialNumber || "")}</td>
          <td class="col-subject" title="${escapeHtml(r.subject || "")}">${escapeHtml(r.subject || "")}</td>
          <td>${escapeHtml(r.type || "")}</td>
          <td><span class="badge ${badgeClass(r.status)}">${escapeHtml(r.status || "")}</span></td>
          <td>${escapeHtml(r.owner || "")}</td>
          <td>${escapeHtml(r.sprint || "")}</td>
          <td>${r.createdDisplay}</td>
          <td>${r.finishedDisplay}</td>
        </tr>
      `
      )
      .join("");
  }

  function renderScopeBadge() {
    const el = document.getElementById("filterScopeBadge");
    if (!el) return;
    const parts = [];
    parts.push(state.sprint || "全部迭代");
    parts.push({ all: "全部状态", finished: "已完成", unclosed: "未关闭", cancelled: "已取消" }[state.finishStatus]);
    parts.push(
      state.owner === ALL
        ? state.selectedMembers.length > 0
          ? `全员 ${state.selectedMembers.length} 人`
          : "全部人员"
        : state.owner
    );
    el.textContent = "· " + parts.join(" · ");
  }

  // ---------- 数据 ----------
  function itemInSelectedSprint(it, sprintName) {
    if (!sprintName) return true;
    const names = getSprintNames(it);
    if (sprintName === NO_SPRINT) return names.length === 0;
    return names.includes(sprintName);
  }
  function passesFinishStatus(it) {
    switch (state.finishStatus) {
      case "finished":  return isFinishedStage(it);
      case "unclosed":  return !isClosedStage(it);
      case "cancelled": return it?.statusStage?.name === "异常结束";
      default: return true;
    }
  }
  function passesOwner(it) {
    if (state.owner === ALL) return true;
    return getOwnerNames(it).includes(state.owner); // 测试计划可能有多个负责人
  }

  function computeForProject(items) {
    const stat = { total: items.length, finished: 0, unclosed: 0, statusDist: {} };
    for (const it of items) {
      if (isFinishedStage(it)) stat.finished++;
      if (!isClosedStage(it)) stat.unclosed++;
      const s = getStatusName(it);
      stat.statusDist[s] = (stat.statusDist[s] || 0) + 1;
    }
    return stat;
  }

  function workitemUrl(projId, category, identifier) {
    if (!identifier || !category) return "";
    const cat = String(category).toLowerCase(); // Req->req, Task->task, Bug->bug
    return `https://devops.aliyun.com/projex/project/${projId}/${cat}/${identifier}`;
  }

  function collectRows(itemsByProject) {
    const rows = [];
    for (const proj of PROJECTS) {
      for (const it of (itemsByProject[proj.id] || [])) {
        rows.push({
          projectName: proj.name,
          serialNumber: it.serialNumber || "",
          subject: it.subject || "",
          type: getWorkitemType(it),
          status: getStatusName(it),
          owner: getOwnerName(it),
          sprint: getSprintNames(it).join("、") || "—",
          createdAt: it.gmtCreate || 0,
          finishedAt: it.finishTime || 0,
          createdDisplay: formatTime(it.gmtCreate),
          finishedDisplay: formatTime(it.finishTime),
          // 「全部」Tab 下混合了多个类别，深链按工作项自身的 categoryIdentifier 生成
          url: workitemUrl(proj.id, it.categoryIdentifier || (state.category === "All" ? "" : state.category), it.identifier),
        });
      }
    }
    return rows;
  }

  function applySort(rows) {
    if (!state.sort.key) return rows;
    const k = state.sort.key;
    const d = state.sort.dir;
    const copy = rows.slice();
    copy.sort((a, b) => {
      const va = a[k], vb = b[k];
      const ea = va == null || va === "";
      const eb = vb == null || vb === "";
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * d;
      return String(va).localeCompare(String(vb), "zh-CN", { numeric: true }) * d;
    });
    return copy;
  }

  // ---------- 下拉填充 ----------
  function collectSprintsForCurrent() {
    const set = new Set();
    const byProj = state.data[state.category] || {};
    for (const projId of Object.keys(byProj)) {
      for (const it of byProj[projId]) {
        if (!isMemberItem(it, state.selectedMembers)) continue;
        const names = getSprintNames(it);
        if (names.length === 0) set.add(NO_SPRINT);
        else names.forEach((n) => set.add(n));
      }
    }
    return [...set].sort((a, b) => {
      if (a === NO_SPRINT) return 1;
      if (b === NO_SPRINT) return -1;
      return b.localeCompare(a, "zh-CN");
    });
  }

  function populateSprintSelect() {
    const sel = document.getElementById("sprintFilter");
    const sprints = collectSprintsForCurrent();
    // 当前选中的迭代如果已经不在列表里，回退到"全部"（空串，itemInSelectedSprint 会全通过）
    if (state.sprint && !sprints.includes(state.sprint)) state.sprint = "";
    const opts = [
      `<option value=""${state.sprint === "" ? " selected" : ""}>全部</option>`,
      ...sprints.map(
        (s) => `<option value="${escapeHtml(s)}"${s === state.sprint ? " selected" : ""}>${escapeHtml(s)}</option>`
      ),
    ];
    sel.innerHTML = opts.join("");
  }

  // 责任人下拉的候选名单：配置了成员名单用名单；名单为空（不过滤）时从当前数据聚合
  function ownerCandidates() {
    if (state.selectedMembers.length > 0) return state.selectedMembers.slice();
    const set = new Set();
    const byProj = state.data[state.category] || {};
    for (const projId of Object.keys(byProj)) {
      for (const it of byProj[projId]) getOwnerNames(it).forEach((n) => set.add(n));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function populateOwnerSelect() {
    const sel = document.getElementById("ownerFilter");
    const members = ownerCandidates();
    const opts = [
      `<option value="${ALL}"${state.owner === ALL ? " selected" : ""}>全部（${members.length} 人）</option>`,
      ...members.map((n) => `<option value="${escapeHtml(n)}"${state.owner === n ? " selected" : ""}>${escapeHtml(n)}</option>`),
    ];
    // 如果当前 owner 已不在选中列表，重置
    if (state.owner !== ALL && !members.includes(state.owner)) state.owner = ALL;
    sel.innerHTML = opts.join("");
  }

  function populateFinishStatusSelect() {
    document.getElementById("statusFilter").value = state.finishStatus;
  }

  // ---------- 主流程 ----------
  function renderEmpty() {
    renderCards({});
    renderCharts({});
    renderTable([]);
  }

  function renderCurrent() {
    const rawByProject = state.data[state.category] || {};
    const filtered = {};
    for (const proj of PROJECTS) {
      filtered[proj.id] = (rawByProject[proj.id] || [])
        .filter((it) => isMemberItem(it, state.selectedMembers))
        .filter((it) => itemInSelectedSprint(it, state.sprint))
        .filter(passesFinishStatus)
        .filter(passesOwner);
    }
    const perProject = {};
    for (const proj of PROJECTS) perProject[proj.id] = computeForProject(filtered[proj.id] || []);
    renderCards(perProject);
    renderCharts(perProject);
    renderTable(applySort(collectRows(filtered)));
    renderScopeBadge();
  }

  // 拉取单个类别到 state.data[category]。「测试」走 testhub 接口，其余走 workitem 接口。
  // N 个项目并发拉取（每个项目内部分页仍是顺序的）。
  async function fetchCategoryIntoState(category, force) {
    if (!force && state.data[category]) return;
    const lists = await Promise.all(
      PROJECTS.map((proj) =>
        category === "Test" ? fetchAllTestPlans(proj.id) : fetchAllWorkitems(proj.id, category)
      )
    );
    const result = {};
    const merge = [];
    PROJECTS.forEach((proj, i) => {
      result[proj.id] = lists[i];
      merge.push(...lists[i]);
    });
    state.data[category] = result;
    await mergeSeenMembers(extractMembers(merge));
  }

  const SINGLE_CATEGORIES = ["Req", "Task", "Test", "Bug"];

  async function loadCategory(category, force = false) {
    if (state.loading) return;
    state.loading = true;
    document.getElementById("refreshBtn").disabled = true;
    setStatus(`正在加载 ${CATEGORY_LABEL[category]}…`);

    try {
      if (category === "All") {
        await Promise.all(SINGLE_CATEGORIES.map((c) => fetchCategoryIntoState(c, force)));
        const merged = {};
        for (const proj of PROJECTS) {
          merged[proj.id] = SINGLE_CATEGORIES.flatMap((c) => (state.data[c] && state.data[c][proj.id]) || []);
        }
        state.data.All = merged;
      } else {
        await fetchCategoryIntoState(category, force);
      }
      populateSprintSelect();
      populateOwnerSelect();
      populateFinishStatusSelect();
      renderCurrent();
      setStatus(`完成 · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error("[seg] loadCategory failed", e);
      renderEmpty();
      setStatus(e.message || String(e), true);
    } finally {
      state.loading = false;
      document.getElementById("refreshBtn").disabled = false;
    }
  }

  function bindEvents() {
    document.getElementById("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn || btn.classList.contains("disabled")) return;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      state.category = btn.dataset.category;
      loadCategory(state.category);
    });

    document.getElementById("sprintFilter").addEventListener("change", (e) => {
      state.sprint = e.target.value;
      renderCurrent();
    });
    document.getElementById("statusFilter").addEventListener("change", (e) => {
      state.finishStatus = e.target.value;
      renderCurrent();
    });
    document.getElementById("ownerFilter").addEventListener("change", (e) => {
      state.owner = e.target.value;
      renderCurrent();
    });

    document.getElementById("refreshBtn").addEventListener("click", async () => {
      await bootstrapAndLoad(true);
    });

    document.querySelectorAll("#detailTable th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sort.key !== key) state.sort = { key, dir: 1 };
        else if (state.sort.dir === 1) state.sort = { key, dir: -1 };
        else state.sort = { key: null, dir: 1 };
        renderCurrent();
      });
    });

    document.querySelector("#detailTable tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row-link");
      if (!tr) return;
      const url = tr.dataset.url;
      if (url) window.open(url, "_blank", "noopener");
    });
  }

  // 把"取 csrf + 拉项目列表 + 拉当前类别工作项"打包成一条路径，
  // init 和"刷新"按钮都走它。否则刷新按钮只重跑 loadCategory，
  // 一旦初次进入时 csrf 还没捕获就会导致 PROJECTS 一直为空，得整页刷新才行。
  async function bootstrapAndLoad(force) {
    state.selectedMembers = await getSelectedMembers();

    // 主动自举：打开插件即获取 csrfToken/workspaceId，无需先访问云效页面。
    // 「刷新」时强制重新获取（token 永远是新鲜的，顺带解决长时间不操作过期的问题）。
    setStatus("获取云效登录态…");
    const ok = await bootstrapAuth(force);
    if (!ok) {
      setStatus("未检测到云效登录态：请先在浏览器登录 devops.aliyun.com，然后回来点「刷新」。", true);
      return;
    }

    try {
      setStatus("加载项目列表…");
      await fetchProjects();
    } catch (e) {
      console.error("[seg] fetchProjects failed", e);
      setStatus("加载项目列表失败：" + (e.message || String(e)), true);
      return;
    }
    if (PROJECTS.length === 0) {
      setStatus("项目列表为空：当前账号在工作空间下没有可见的项目（或接口返回为空）。", true);
      return;
    }
    console.log("[seg] bootstrap using projects:", PROJECTS);
    await loadCategory(state.category, force);
  }

  async function init() {
    try {
      bindEvents();
      renderEmpty();
      await bootstrapAndLoad(false);
    } catch (e) {
      console.error("[seg] init failed", e);
      showFatal((e && e.message) || String(e));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
