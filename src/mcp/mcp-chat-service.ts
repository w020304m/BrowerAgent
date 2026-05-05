/**
 * MCP Chat Service.
 * Implements the agentic loop for MCP tool calling.
 *
 * This is NOT a pipeline step - it's an independent service because:
 * 1. It involves multiple model calls (stream → detect tools → execute → stream again)
 * 2. It needs to update the store between iterations (show tool cards, approval UI)
 * 3. It has its own control flow (while loop + break conditions)
 */

import type { ChatMessage } from '@/types/message'
import type { McpToolCall, ToolCall, ToolCallChunk } from '@/types/tool'
import type { ProviderType } from '@/types/provider'
import type { ModelParams } from '@/providers/types'
import type { McpConnectableServer } from './types'
import type { PendingMcpApproval } from '@/types/chat'
import type { McpActionInfo } from './types'
import { McpClientManager } from './mcp-client'
import { createChatProvider } from '@/providers/factory'
import { getMcpToolExecutionMode } from './utils'
import { waitForMcpToolApproval } from '@/store/mcp-store'
import { mcpSettings } from '@/storage/mcp-settings'
import { accumulateToolCallChunks } from '@/stream/tool-call-accumulator'

// === Callbacks ===

export interface McpChatCallbacks {
  onToken: (token: string) => void
  onReasoningToken: (token: string) => void
  onToolCallsDetected: (toolCalls: McpToolCall[]) => void
  onToolResult: (result: { toolCallId: string; content: string; isError: boolean }) => void
  onActionInfo: (info: McpActionInfo | null) => void
  onError: (error: Error) => void
}

// === Config ===

export interface McpChatConfig {
  historyId: string
  providerType: ProviderType
  modelId: string
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  params?: ModelParams
  systemPrompt?: string
  messages: ChatMessage[]
  userInput: string
  signal?: AbortSignal
}

// === Internal types ===

interface StreamModelResult {
  content: string
  reasoningContent?: string
  toolCalls: McpToolCall[]
}

/**
 * MCP Chat Service.
 * Runs the agentic loop: stream model → detect tool calls → execute tools → repeat.
 */
export class McpChatService {
  private config: McpChatConfig
  private callbacks: McpChatCallbacks
  private servers: McpConnectableServer[]
  private mcpClient: McpClientManager | null = null

  constructor(
    config: McpChatConfig,
    callbacks: McpChatCallbacks,
    servers: McpConnectableServer[]
  ) {
    this.config = config
    this.callbacks = callbacks
    this.servers = servers
  }

  /**
   * Run the agentic loop.
   */
  async run(): Promise<void> {
    const { servers } = this

    if (servers.length === 0) {
      this.callbacks.onError(new Error('No MCP servers configured'))
      return
    }

    this.mcpClient = new McpClientManager(servers)

    try {
      // 1. Get tools from MCP servers
      this.callbacks.onActionInfo({ type: 'mcp', phase: 'loading_tools', toolCount: 0 })

      const tools = await this.mcpClient.getTools()

      this.callbacks.onActionInfo({
        type: 'mcp',
        phase: 'loading_tools',
        toolCount: tools.length,
      })

      if (tools.length === 0) {
        // No tools available, fall back to normal chat
        return
      }

      // 2. Create chat provider
      const provider = createChatProvider({
        provider: this.config.providerType,
        model: this.config.modelId,
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey,
        headers: this.config.headers,
        params: this.config.params,
      })

      // 3. Build conversation
      const conversation: ChatMessage[] = [...this.config.messages]

      if (this.config.systemPrompt) {
        conversation.unshift({
          id: '__system__',
          historyId: this.config.historyId,
          role: 'system',
          content: this.config.systemPrompt,
          createdAt: Date.now(),
        })
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        historyId: this.config.historyId,
        role: 'user',
        content: this.config.userInput,
        createdAt: Date.now(),
      }
      conversation.push(userMessage)

      // 4. Check human-in-loop setting
      const requireApproval = await mcpSettings.isHumanInLoop()

      // 5. Agentic loop
      let maxIterations = 10 // Safety limit
      while (maxIterations-- > 0) {
        // Check abort
        if (this.config.signal?.aborted) break

        // 5a. Stream model call with tools
        const result = await this.streamModelCall(provider, conversation, tools)

        // 5b. No tool calls → done
        if (result.toolCalls.length === 0) break

        // Notify UI about detected tool calls
        this.callbacks.onToolCallsDetected(result.toolCalls)

        // 5c. Execute each tool call
        for (const toolCall of result.toolCalls) {
          if (this.config.signal?.aborted) break

          // Check execution mode
          const mode = getMcpToolExecutionMode()

          if (requireApproval && mode === 'human_in_loop') {
            // Show approval dialog
            this.callbacks.onActionInfo({
              type: 'mcp',
              phase: 'awaiting_approval',
              serverName: toolCall.serverName,
              toolName: toolCall.name,
            })

            const approval: PendingMcpApproval = {
              toolName: toolCall.name,
              serverName: toolCall.serverName ?? '',
              args: toolCall.args ?? {},
              toolCallId: toolCall.id,
            }

            const approved = await waitForMcpToolApproval(approval)
            this.callbacks.onActionInfo(null)

            if (!approved) continue
          } else if (mode === 'disabled') {
            continue
          }

          // Execute tool
          this.callbacks.onActionInfo({
            type: 'mcp',
            phase: 'calling_tool',
            serverName: toolCall.serverName,
            toolName: toolCall.name,
          })

          const toolResult = await this.mcpClient.executeTool(
            toolCall,
            this.config.signal
          )

          this.callbacks.onToolResult(toolResult)

          // Add assistant message with tool calls to conversation
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID?.() ?? Date.now().toString(),
            historyId: this.config.historyId,
            role: 'assistant',
            content: result.content,
            toolCalls: result.toolCalls,
            createdAt: Date.now(),
          }
          conversation.push(assistantMsg)

          // Add tool result message to conversation
          const toolResultMsg: ChatMessage = {
            id: crypto.randomUUID?.() ?? Date.now().toString(),
            historyId: this.config.historyId,
            role: 'tool',
            content: toolResult.content,
            toolCallId: toolResult.toolCallId,
            toolError: toolResult.isError,
            createdAt: Date.now(),
          }
          conversation.push(toolResultMsg)
        }

        this.callbacks.onActionInfo(null)
      }
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error : new Error(String(error))
      )
    } finally {
      await this.mcpClient?.close()
      this.callbacks.onActionInfo(null)
    }
  }

  /**
   * Stream a model call, accumulating content and tool call chunks.
   */
  private async streamModelCall(
    provider: ReturnType<typeof createChatProvider>,
    messages: ChatMessage[],
    tools: Awaited<ReturnType<McpClientManager['getTools']>>
  ): Promise<StreamModelResult> {
    let content = ''
    let reasoningContent = ''
    const allToolCallChunks: ToolCallChunk[] = []

    const stream = provider.streamChat(messages, { tools })

    try {
      for await (const chunk of stream) {
        if (this.config.signal?.aborted) break

        if (chunk.content) {
          content += chunk.content
          this.callbacks.onToken(chunk.content)
        }

        if (chunk.reasoningContent) {
          reasoningContent += chunk.reasoningContent
          this.callbacks.onReasoningToken(chunk.reasoningContent)
        }

        if (chunk.toolCallChunks?.length) {
          allToolCallChunks.push(...chunk.toolCallChunks)
        }
      }
    } catch (error) {
      // If the stream was aborted, return what we have
      if (!this.config.signal?.aborted) {
        throw error
      }
    }

    const toolCalls = accumulateToolCallChunks(allToolCallChunks)

    return { content, reasoningContent: reasoningContent || undefined, toolCalls }
  }
}
