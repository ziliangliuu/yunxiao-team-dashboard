// 本地私有配置（可选）。
// 复制本文件为 config.local.js 并按需修改 —— config.local.js 已被 .gitignore 忽略，不会提交。
// 没有该文件时扩展也能正常工作：默认成员名单为空（= 不过滤，展示全部人员的工作项），
// 工作空间 ID 完全依赖 background.js 从你的真实请求里自动捕获。
window.SegLocalConfig = {
  // 默认统计成员名单（按云效里的显示名）。留空数组或删掉本字段 = 展示全部人员。
  defaultTeam: ["张三", "李四"],

  // 工作空间 ID 兜底值（一般不需要：扩展会自动从请求头捕获 last-workspace）。
  defaultWorkspaceId: "",
};
