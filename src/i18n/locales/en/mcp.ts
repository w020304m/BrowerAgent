const mcp = {
  title: 'MCP Tools',
  approvalTitle: 'Tool Approval',
  approvalDescription: 'Do you want to allow this tool call?',
  approve: 'Approve',
  reject: 'Reject',
  alwaysAllow: 'Always allow this tool',
  toolName: 'Tool Name',
  serverName: 'Server',
  parameters: 'Parameters',
  result: 'Result',
  error: 'Error',
  success: 'Success',
  calling: 'Calling tool...',
  connecting: 'Connecting to server...',
  loadingTools: 'Loading tools...',
  noToolsAvailable: 'No tools available',
  toolCallCard: {
    collapsed: '{{count}} tool call(s)',
    args: 'Arguments',
    result: 'Result',
  },
} as const
export default mcp
