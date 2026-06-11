# 项目：云效团队工作看板（Chrome 扩展，Manifest V3）

聚合 devops.aliyun.com（阿里云云效）工作空间下所有公开项目的 需求/任务/测试计划/缺陷，做成仪表盘。零后端：复用浏览器登录态直接调云效 web API。

## 必读

- `需求.md` 是单一事实来源：完整需求口径 + 已抓包确认的云效 web API（路径、请求体、响应字段、状态判定规则）。改功能前先读它，改完同步更新它。
- 纯前端原生 JS（无构建、无框架、无依赖），`<script>` 直接引入，`window.SegApi` 作为模块边界。保持这个风格。
- **每次改 extension/ 下的代码，`manifest.json` 的 version 必须 +0.1**（minor +1，patch 归 0）。

## 关键约定

- 隐私：默认成员名单、工作空间 ID 兜底值放在 `extension/dashboard/config.local.js`（gitignored，模板 `config.local.example.js`）。**严禁把真实姓名、工作空间 ID 等写死进可提交的文件**。无配置时成员名单为空 = 不过滤、展示全部人员。
- 鉴权：`background.js` 用 webRequest 监听云效请求，捕获 `x-csrf-token` 和 `last-workspace` 存入 `chrome.storage.session`（降级 local）。仪表盘 fetch 带 `credentials: include`。
- 测试不在 workitem 体系：走 `/testhub/webapi/...`（见 需求.md 第四节），`api.js` 把测试计划转成 workitem 形状复用现有渲染管线；测试计划有多个负责人（`__owners`）。
- 完成口径用 `statusStage.name`（"正常结束"=已完成；非"正常结束/异常结束"=未关闭），不要用 `logicalStatus` 或 `finishTime` 判定。

## 验证

无自动化测试。改完后：`node --check` 各 JS 文件；在 chrome://extensions 重载扩展，打开仪表盘切各 Tab、筛选、排序、点行跳转，确认状态栏无报错。
