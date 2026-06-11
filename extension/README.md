# SEG 部门工作统计 — Chrome 扩展

查看 devops.aliyun.com 工作空间下所有项目的工作量统计（需求 / 任务 / 缺陷），按迭代、完成状态、责任人聚合。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录（`extension/`）

## 使用

1. 浏览器登录 [devops.aliyun.com](https://devops.aliyun.com) 并确保停留在自己的工作空间
2. **任意打开一个项目页**（例如 `https://devops.aliyun.com/projex/project/<projectId>/req`），让扩展抓到一次 API 请求 —— `background.js` 会自动把 `x-csrf-token` 和 `last-workspace` 写到 session storage
3. 点 Chrome 工具栏中的扩展图标 → 仪表盘新标签页打开
4. 顶部切 Tab（全部 / 需求 / 任务 / 测试 / 缺陷，打开默认「全部」）/ 选迭代（默认"全部"）/ 完成状态 / 责任人；点表头排序；点行直接跳到工作项详情

> 「测试」Tab 展示测试计划（TestPlan）粒度，用例进度（通过/失败/待测/暂缓）汇总在标题里；项目未开通测试模块时按 0 条处理。「全部」= 四个类别的合并视图。

## 第一次使用必看（也包括别人拿到这个插件时）

- **默认不过滤成员**：没有本地配置时统计全部人员的工作项。想固定统计自己团队，可以在「成员设置」里勾选保存，或复制 `dashboard/config.local.example.js` 为 `config.local.js` 写入默认名单（该文件已被 .gitignore 忽略，不会提交）
- 项目列表是动态拉的（`workspace/project/search/list`），但**目前只拉 `scope=public` 的公开项目**。私有项目暂时看不到，需要改 `dashboard/api.js` 里 `fetchProjects()` 的 `extraConditions`
- 工作空间 ID 由扩展从你的真实请求里自动捕获（**第一次用前先打开一次自己工作空间的项目页**）；也可在 `config.local.js` 里配置兜底值

## 报错处理

- **"尚未捕获到 csrf-token"** → 刷新一次 devops 项目页面再回来点「刷新」
- **"加载项目列表失败"** → 多半是登录态/权限不够。重登 devops 后再试
- **接口 401/403** → 登录态过期，重新登录 devops 即可
- **明细列表全空** → 检查"成员设置"里有没有选自己团队成员；状态栏选回"全部"

## 文件结构

```
extension/
├── manifest.json        Manifest V3 配置
├── background.js        Service worker：抓 csrf-token / last-workspace、点图标开仪表盘
├── icons/               扩展图标
└── dashboard/
    ├── index.html       仪表盘页面
    ├── index.css        样式
    ├── api.js           devops API 封装（projects 列表 + 工作项 list/count + 全量拉取）
    ├── index.js         主逻辑（Tab / 迭代 / 状态 / 责任人 过滤、卡片、图、表）
    ├── members.html     成员设置页
    └── members.js       成员设置逻辑
```

## 已知限制

- csrf-token 来自最近一次 devops API 请求的请求头，长时间不操作可能失效，刷新 devops 页面即可重新捕获
- 全量拉取 + 前端筛选，单项目工作项过多（数千+）时首次加载会较慢；当前用 pageSize=200 分页
- 未上架 Chrome 商店，对方所在企业的浏览器策略可能禁用"开发者模式加载"
- 仅拉取 `scope=public` 项目；如果团队需要私有项目，得放开 `fetchProjects` 里的 `extraConditions`
