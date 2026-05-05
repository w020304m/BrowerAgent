const mcp = {
  title: 'MCP 工具',
  approvalTitle: '工具审批',
  approvalDescription: '是否允许执行此工具调用？',
  approve: '批准',
  reject: '拒绝',
  alwaysAllow: '始终允许此工具',
  toolName: '工具名称',
  serverName: '服务器',
  parameters: '参数',
  result: '结果',
  error: '错误',
  success: '成功',
  calling: '正在调用工具...',
  connecting: '正在连接服务器...',
  loadingTools: '正在加载工具...',
  noToolsAvailable: '无可用工具',
  toolCallCard: {
    collapsed: '{{count}} 个工具调用',
    args: '参数',
    result: '结果',
  },
} as const
export default mcp
