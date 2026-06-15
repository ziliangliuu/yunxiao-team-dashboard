const DEVOPS_BASE = "https://devops.aliyun.com";

// 私有信息（默认成员名单、工作空间 ID 兜底值）放在 config.local.js（gitignored，可选）。
// 没有本地配置时：成员名单为空 = 不过滤、展示全部人员；工作空间 ID 依赖 background.js 自动捕获。
const LOCAL_CONFIG = (typeof window !== "undefined" && window.SegLocalConfig) || {};
const DEFAULT_WORKSPACE_ID = LOCAL_CONFIG.defaultWorkspaceId || "";

// 项目列表运行时动态从 devops 接口拉取，初始为空。
// 注意：这里必须保持同一个数组引用（用 splice 原地替换），
// 这样 index.js 解构得到的 PROJECTS 也能看到最新内容。
const PROJECTS = [];

const CATEGORY_LABEL = { All: "全部", Req: "需求", Task: "任务", Test: "测试", Bug: "缺陷" };

const DEFAULT_TEAM = Array.isArray(LOCAL_CONFIG.defaultTeam) ? LOCAL_CONFIG.defaultTeam : [];

// ---------- 成员存储 ----------
async function getSelectedMembers() {
  try {
    const r = await chrome.storage.local.get("selectedMembers");
    if (Array.isArray(r.selectedMembers)) return r.selectedMembers;
  } catch (e) {}
  return DEFAULT_TEAM.slice();
}

async function setSelectedMembers(names) {
  await chrome.storage.local.set({ selectedMembers: names });
}

async function getSeenMembers() {
  try {
    const r = await chrome.storage.local.get("seenMembers");
    if (Array.isArray(r.seenMembers)) return r.seenMembers;
  } catch (e) {}
  return [];
}

async function mergeSeenMembers(newOnes) {
  const cur = await getSeenMembers();
  const map = new Map(cur.map((m) => [m.displayName || m.realName || m.identifier, m]));
  for (const m of newOnes) {
    const key = m?.displayName || m?.realName || m?.identifier;
    if (!key) continue;
    if (!map.has(key)) map.set(key, m);
  }
  const merged = [...map.values()];
  await chrome.storage.local.set({ seenMembers: merged });
  return merged;
}

function extractMembers(items) {
  const map = new Map();
  function add(u) {
    if (!u || typeof u !== "object") return;
    const key = u.displayName || u.realName || u.identifier;
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        identifier: u.identifier || "",
        displayName: u.displayName || "",
        realName: u.realName || "",
        nickName: u.nickName || "",
        avatar: u.avatar || "",
      });
    }
  }
  for (const it of items) {
    add(it?.assignedTo);
    add(it?.assignedToUser);
    add(it?.creator);
    add(it?.modifier);
    const parts = it && it["ak.issue.member"]; // 参与人（参与者）
    if (Array.isArray(parts)) for (const u of parts) add(u);
  }
  return [...map.values()];
}

// ---------- 负责人（assignedTo）----------
function getOwnerNames(it) {
  if (Array.isArray(it?.__owners)) return it.__owners; // 测试计划：多负责人
  const n =
    it?.assignedTo?.displayName ||
    it?.assignedTo?.realName ||
    it?.assignedToUser?.displayName ||
    it?.assignedToUser?.realName ||
    "";
  return n ? [n] : [];
}

function getOwnerName(it) {
  return getOwnerNames(it).join("、");
}

// ---------- 参与人（云效系统字段「参与者」 ak.issue.member）----------
// 工作项列表响应里平铺在顶层 key "ak.issue.member"，是用户对象数组（可能为空或缺失）。
// 测试计划没有参与人概念，转换形状里不含该字段，自然返回 []。
function getParticipantNames(it) {
  const arr = it && it["ak.issue.member"];
  if (!Array.isArray(arr)) return [];
  return arr.map((u) => u && (u.displayName || u.realName)).filter(Boolean);
}

// 负责人 ∪ 参与人（去重）。成员过滤与「责任人」筛选都按这个口径匹配：
// 选中某人时，ta 是负责人或参与人之一即命中。
function getPersonNames(it) {
  const set = new Set();
  for (const n of getOwnerNames(it)) set.add(n);
  for (const n of getParticipantNames(it)) set.add(n);
  return [...set];
}

function isMemberItem(it, selected) {
  if (!selected || selected.length === 0) return true; // 名单为空 = 不过滤，展示全部人员
  return getPersonNames(it).some((n) => selected.includes(n));
}

// ---------- 工作项语义 ----------
function getSprintNames(it) {
  const s = it?.sprint;
  if (!s) return [];
  if (Array.isArray(s)) return s.map((x) => (x && (x.name || String(x))) || "").filter(Boolean);
  if (typeof s === "string") return [s];
  if (typeof s === "object") return s.name ? [s.name] : [];
  return [];
}
function isClosedStage(it) {
  const n = it?.statusStage?.name;
  return n === "正常结束" || n === "异常结束";
}
function isFinishedStage(it) {
  return it?.statusStage?.name === "正常结束";
}

// ---------- 鉴权 + API ----------
async function readStorage(keys) {
  try {
    const s = await chrome.storage.session.get(keys);
    if (s && s.csrfToken) return s;
  } catch (e) {}
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    return {};
  }
}

async function getAuthHeaders() {
  const stored = await readStorage(["csrfToken", "workspaceId"]);
  if (!stored.csrfToken) {
    const err = new Error(
      "尚未捕获到 csrf-token。请新开一个标签页打开 devops.aliyun.com 项目页面（任意点击一下需求/任务），让扩展抓到一次 API 请求，然后回这里点「刷新」。"
    );
    err.code = "NO_CSRF";
    throw err;
  }
  const workspaceId = stored.workspaceId || DEFAULT_WORKSPACE_ID;
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "x-csrf-token": stored.csrfToken,
    "x-requested-with": "XMLHttpRequest",
  };
  if (workspaceId) {
    headers["last-workspace"] = workspaceId;
    headers["web-last-workspace"] = workspaceId;
  }
  return headers;
}

async function apiPost(path, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${DEVOPS_BASE}${path}`, {
    method: "POST", credentials: "include", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status} ${path}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`接口错误：${json.errorMsg || json.msg || JSON.stringify(json).slice(0, 200)}`);
  return json.result;
}

async function apiGet(path) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${DEVOPS_BASE}${path}`, {
    method: "GET", credentials: "include", headers,
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status} ${path}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`接口错误：${json.errorMsg || json.msg || JSON.stringify(json).slice(0, 200)}`);
  return json.result;
}

async function fetchProjects() {
  // 复用 devops 项目列表页面用的接口；extraConditions 只保留 scope=public，
  // 不再按"用户是成员"过滤，这样就能拿到当前工作空间下所有公开项目。
  const extraConditions = encodeURIComponent(JSON.stringify({
    conditionGroups: [
      [{ className: "string", fieldIdentifier: "scope", format: "list", operator: "CONTAINS", value: ["public"] }],
    ],
  }));
  const conditions = encodeURIComponent(JSON.stringify({ conditionGroups: [[]] }));
  const path =
    `/projex/api/workspace/project/search/list` +
    `?extraConditions=${extraConditions}` +
    `&conditions=${conditions}` +
    `&scope=all&category=Project&toPage=1&pageSize=200&_input_charset=utf-8`;
  const result = await apiGet(path);
  const list = Array.isArray(result) ? result : (result?.list || result?.records || []);
  console.log("[seg] fetchProjects raw count:", list.length, "result:", result);
  const projects = list
    .filter((p) => p && p.identifier && p.type !== "ProjectGroup" && p.logicalStatus !== "ARCHIVED")
    .map((p) => ({ id: p.identifier, name: p.name }));
  PROJECTS.splice(0, PROJECTS.length, ...projects);
  console.log("[seg] fetchProjects loaded", PROJECTS.length, "projects:", PROJECTS);
  return PROJECTS;
}

async function countWorkitems(spaceIdentifier, category) {
  return apiPost("/projex/api/workitem/workitem/list/count?_input_charset=utf-8", {
    spaceType: "Project", spaceIdentifier, category,
    conditions: '{"conditionGroups":[]}', searchType: "LIST",
  });
}

async function listWorkitemsPage(spaceIdentifier, category, page, pageSize) {
  return apiPost("/projex/api/workitem/workitem/list?_input_charset=utf-8", {
    spaceType: "Project", spaceIdentifier, category,
    toPage: page, pageSize,
    conditions: '{"conditionGroups":[]}', searchType: "LIST",
  });
}

async function fetchAllWorkitems(spaceIdentifier, category) {
  const pageSize = 200;
  const total = await countWorkitems(spaceIdentifier, category);
  if (!total || total === 0) return [];
  const pages = Math.ceil(total / pageSize);
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const result = await listWorkitemsPage(spaceIdentifier, category, p, pageSize);
    const items = Array.isArray(result) ? result : result?.list || result?.records || result?.data || [];
    all.push(...items);
  }
  return all;
}

// ---------- 测试计划（testhub）----------
// 测试不在 workitem 体系里，走独立的 testhub webapi（已通过浏览器抓包确认）：
//   列表：GET /testhub/webapi/workspace/project/{projectId}/testPlan/list
//        ?name=&category=TestPlan&toPage=1&pageSize=200（不传 status 即返回全部状态）
//   进度：GET /testhub/webapi/workspace/testPlan/{planId}/progressRate
//        → { paasCount, failureCount, postponeCount, todoCount }
// 详情深链：/projex/project/{projectId}/testplan/{identifier}
// 这里把测试计划转换成 workitem 形状，复用仪表盘现有的过滤/统计/渲染管线。
const TEST_STATUS_LABEL = { TODO: "未开始", DOING: "进行中", DONE: "已完成" };

function testPlanToWorkitem(p, progress) {
  const statusLabel = TEST_STATUS_LABEL[p.statusName] || p.statusName || "未知";
  const owners = (p.managers || [])
    .map((m) => m.displayName || m.realName)
    .filter(Boolean);
  let subject = p.name || "";
  if (progress) {
    const c = (k) => progress[k] || 0;
    const total = c("paasCount") + c("failureCount") + c("postponeCount") + c("todoCount");
    subject += `（用例 ${total}：通过 ${c("paasCount")} / 失败 ${c("failureCount")} / 待测 ${c("todoCount")} / 暂缓 ${c("postponeCount")}）`;
  }
  return {
    identifier: p.identifier,
    serialNumber: "",
    subject,
    status: { name: statusLabel },
    statusStage: { name: p.statusName === "DONE" ? "正常结束" : "进行中" },
    assignedTo: (p.managers || [])[0] || null,
    __owners: owners, // 测试计划有多个负责人（managers）
    sprint: p.sprint || null,
    gmtCreate: p.gmtCreate || 0,
    finishTime: p.statusName === "DONE" ? p.endDate || 0 : 0,
    workitemType: { displayName: "测试计划" },
    categoryIdentifier: "TestPlan",
  };
}

async function fetchAllTestPlans(spaceIdentifier) {
  const path =
    `/testhub/webapi/workspace/project/${spaceIdentifier}/testPlan/list` +
    `?name=&category=TestPlan&toPage=1&pageSize=200&_input_charset=utf-8`;
  let result;
  try {
    result = await apiGet(path);
  } catch (e) {
    // 项目未开通测试模块（如 SEG）时接口会报错，按空列表处理，不影响其他项目
    console.warn("[seg] fetchAllTestPlans skipped for", spaceIdentifier, e.message);
    return [];
  }
  const list = Array.isArray(result) ? result : result?.list || [];
  return Promise.all(
    list.map(async (p) => {
      let progress = null;
      try {
        progress = await apiGet(`/testhub/webapi/workspace/testPlan/${p.identifier}/progressRate?_input_charset=utf-8`);
      } catch (e) {}
      return testPlanToWorkitem(p, progress);
    })
  );
}

async function hasCsrfToken() {
  const stored = await readStorage(["csrfToken"]);
  return !!stored.csrfToken;
}

async function saveAuthData(data) {
  try {
    await chrome.storage.session.set(data);
  } catch (e) {
    await chrome.storage.local.set(data);
  }
}

// 主动自举鉴权：直接 fetch 云效 /projex 页面（带浏览器 cookie），
// csrfToken 和 workspaceId 都是服务端渲染在 HTML 里的，每次请求都返回新 token。
// 这样打开插件即可用，无需先访问云效页面让 background 被动抓包（background 抓包保留为兜底）。
// 返回 false = 未登录（HTML 里没有 token，比如被重定向到登录页）。
async function bootstrapAuth(force = false) {
  if (!force && (await hasCsrfToken())) return true;
  try {
    const res = await fetch(`${DEVOPS_BASE}/projex`, { credentials: "include" });
    const html = await res.text();
    const csrf = html.match(/csrfToken["']?\s*[:=]\s*["']([^"']{8,})["']/);
    if (!csrf) return false;
    const data = { csrfToken: csrf[1], capturedAt: Date.now() };
    const ws = html.match(/(?:organizationId|workspaceId|orgId|lastWorkspace)["']?\s*[:=]\s*["']([0-9a-f]{24})["']/);
    if (ws) data.workspaceId = ws[1];
    await saveAuthData(data);
    console.log("[seg] bootstrapAuth ok, csrf:", csrf[1].slice(0, 8) + "...", "ws:", data.workspaceId || "(none)");
    return true;
  } catch (e) {
    console.warn("[seg] bootstrapAuth failed", e);
    return false;
  }
}

window.SegApi = {
  PROJECTS, CATEGORY_LABEL, DEFAULT_TEAM,
  // members
  getSelectedMembers, setSelectedMembers,
  getSeenMembers, mergeSeenMembers, extractMembers, isMemberItem,
  getOwnerName, getOwnerNames, getParticipantNames, getPersonNames,
  // semantic
  getSprintNames, isClosedStage, isFinishedStage,
  // api
  fetchAllWorkitems, countWorkitems, hasCsrfToken, fetchProjects,
  fetchAllTestPlans, bootstrapAuth,
};
