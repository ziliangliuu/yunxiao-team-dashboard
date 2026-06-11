# 云效团队工作看板（Chrome 扩展）

一个零后端的 Chrome 扩展：复用浏览器对 [devops.aliyun.com](https://devops.aliyun.com)（阿里云云效）的登录态，把当前工作空间下所有公开项目的 **需求 / 任务 / 测试计划 / 缺陷** 聚合成一个仪表盘——按迭代、完成状态、责任人筛选，看卡片汇总、状态分布图和可排序明细表，点行直达云效工作项详情。

无需 token、无需服务器、不上传任何数据：所有请求都由你的浏览器直接发给云效。

## 功能

- **五个 Tab**：全部（四类合并）/ 需求 / 任务 / 测试 / 缺陷，打开默认「全部」
- **测试 Tab** 展示测试计划粒度，用例进度（通过/失败/待测/暂缓）汇总在标题里
- **筛选**：迭代（Sprint）、完成状态（未关闭/已完成/已取消）、责任人，三者叠加生效
- **每个项目一张卡片**（总数/已完成/未关闭）+ 按状态着色的横向柱状分布图
- **明细表**：九列全部可排序，点行新标签页打开云效工作项
- **成员设置**：可选地把统计范围固定为自己团队的名单（默认不过滤，统计全部人员）

## 安装

1. 下载本仓库（`git clone` 或 Download ZIP）
2. Chrome 打开 `chrome://extensions/`，开启右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `extension/` 目录
4. 登录 devops.aliyun.com 并**打开自己工作空间下任意一个项目页**（让扩展自动捕获 csrf-token 和工作空间 ID）
5. 点工具栏扩展图标 → 仪表盘打开

## 私有配置（可选）

默认不需要任何配置。如果想固定默认成员名单 / 工作空间 ID 兜底值：

```bash
cp extension/dashboard/config.local.example.js extension/dashboard/config.local.js
# 编辑 config.local.js —— 该文件已被 .gitignore 忽略，不会被提交
```

没有该文件时：成员名单为空 = 不过滤、展示全部人员；工作空间 ID 完全依赖自动捕获。

## 用 AI 快速启用 / 二次开发

仓库自带 `CLAUDE.md`（AI 上下文）和 `需求.md`（完整需求与 API 文档，含已抓包确认的云效 web 接口）。用 [Claude Code](https://claude.com/claude-code) 等 AI 编程工具打开仓库目录，直接说：

> 帮我安装这个扩展并完成首次配置，默认成员名单设为：张三、李四

或者二次开发：

> 给明细表增加一列「优先级」 / 把状态分布图改成饼图 / 支持私有项目

AI 会从 `需求.md` 读到全部接口口径（workitem list/count、testhub testPlan list/progressRate、字段语义、状态判定规则），不需要重新抓包。

## 已知限制

- 仅拉取 `scope=public` 的公开项目（放开 `fetchProjects` 里的 `extraConditions` 可含私有项目）
- csrf-token 来自最近一次云效 API 请求，长期不操作会过期——刷新一次云效页面再点「刷新」即可
- 全量拉取 + 前端过滤，单项目数千条工作项时首次加载较慢
- 云效 web 接口（`/projex/api/*`、`/testhub/webapi/*`）非官方公开 API，云效改版可能需要适配

## 目录结构

```
extension/                         Chrome 扩展（MV3）
├── manifest.json
├── background.js                  捕获 csrf-token / workspaceId；点图标开仪表盘
└── dashboard/
    ├── index.html / index.js      仪表盘（Tab、筛选、卡片、图、表）
    ├── api.js                     云效 API 封装 + 语义函数
    ├── members.html / members.js  成员设置页
    ├── config.local.example.js    私有配置模板（复制为 config.local.js 使用）
    └── index.css
需求.md                            需求与实现说明（含 API 文档）
CLAUDE.md                          AI 编程工具上下文
```

## License

[MIT](LICENSE)
