/**
 * 智能助手聊天中心 UI
 * 
 * 核心理念：每个智能助手是独立个体
 * 
 * 组件结构：
 * 1. 智能助手侧边栏 - 展示用户的所有智能助手及其社交网络
 * 2. 聊天主区域 - 清晰显示"谁在和谁对话"
 * 3. 对话信息侧边栏 - 共享资源、任务、项目信息
 */

import { html, nothing, type TemplateResult } from "lit";

/**
 * 智能助手信息
 */
export interface AgentInfo {
  id: string;
  name: string;
  avatar?: string;
  status: "online" | "busy" | "offline";
  unreadCount?: number;
}

/**
 * 好友信息
 */
export interface FriendInfo {
  id: string;
  name: string;
  avatar?: string;
  status: "online" | "busy" | "offline";
  unreadCount?: number;
  tags?: string[];
  group?: string;
}

/**
 * 群组信息
 */
export interface GroupInfo {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
  unreadCount?: number;
  type?: "work" | "learning" | "interest" | "custom";
}

/**
 * 消息类型
 */
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: "text" | "image" | "file" | "code" | "task" | "meeting";
  timestamp: number;
  replyTo?: string;
  reactions?: Array<{ emoji: string; count: number; users: string[] }>;
  attachments?: Array<{ type: string; url: string; name: string }>;
}

/**
 * 对话上下文
 */
export interface ConversationContext {
  type: "direct" | "group";
  conversationId: string;
  conversationName: string;
  avatar?: string;
  participants?: AgentInfo[];
  sharedFiles?: Array<{ id: string; name: string; type: string; sharedAt: number }>;
  tasks?: Array<{ id: string; title: string; status: string }>;
  projects?: Array<{ id: string; name: string }>;
}

/**
 * 聊天中心状态
 */
export interface ChatHubState {
  /** 当前用户的所有智能助手 */
  myAgents: AgentInfo[];
  
  /** 当前选中的智能助手（视角） */
  currentAgent?: AgentInfo;
  
  /** 当前智能助手的好友列表 */
  friends: FriendInfo[];
  
  /** 当前智能助手的群组列表 */
  groups: GroupInfo[];
  
  /** 当前对话上下文 */
  currentConversation?: ConversationContext;
  
  /** 当前对话的消息列表 */
  messages: Message[];
  
  /** 侧边栏折叠状态 */
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  
  /** 搜索关键词 */
  searchQuery: string;
}

/**
 * 聊天中心属性
 */
export interface ChatHubProps {
  state: ChatHubState;
  onAgentSelect: (agentId: string) => void;
  onConversationSelect: (type: "direct" | "group", id: string) => void;
  onSendMessage: (content: string, type: string) => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onSearch: (query: string) => void;
}

/**
 * 渲染智能助手侧边栏
 */
function renderAgentSidebar(props: ChatHubProps): TemplateResult {
  const { state } = props;
  
  return html`
    <div style="width: ${state.leftSidebarCollapsed ? '60px' : '280px'}; 
                background: #f8f9fa; 
                border-right: 1px solid #e0e0e0;
                transition: width 0.3s ease;
                display: flex;
                flex-direction: column;">
      
      <!-- 折叠按钮 -->
      <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
        ${!state.leftSidebarCollapsed ? html`
          <span style="font-weight: 600; font-size: 14px;">我的智能助手</span>
        ` : nothing}
        <button
          @click=${props.onToggleLeftSidebar}
          style="background: transparent; border: none; cursor: pointer; padding: 4px;">
          ${state.leftSidebarCollapsed ? '→' : '←'}
        </button>
      </div>
      
      ${!state.leftSidebarCollapsed ? html`
        <!-- 搜索框 -->
        <div style="padding: 12px;">
          <input
            type="text"
            placeholder="搜索助手、好友、群组..."
            .value=${state.searchQuery}
            @input=${(e: Event) => props.onSearch((e.target as HTMLInputElement).value)}
            style="width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 13px;"
          />
        </div>
        
        <!-- 智能助手列表 -->
        <div style="flex: 1; overflow-y: auto; padding: 8px;">
          ${state.myAgents.map(agent => html`
            <div
              @click=${() => props.onAgentSelect(agent.id)}
              style="padding: 10px 12px;
                     margin-bottom: 4px;
                     border-radius: 8px;
                     cursor: pointer;
                     background: ${state.currentAgent?.id === agent.id ? '#e3f2fd' : 'transparent'};
                     display: flex;
                     align-items: center;
                     gap: 10px;">
              
              <!-- 头像和状态 -->
              <div style="position: relative;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #2196f3; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                  ${agent.name.substring(0, 1).toUpperCase()}
                </div>
                <div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; background: ${agent.status === 'online' ? '#4caf50' : agent.status === 'busy' ? '#ff9800' : '#9e9e9e'}; border: 2px solid #f8f9fa;"></div>
              </div>
              
              <!-- 名称和未读数 -->
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${agent.name}</div>
                ${agent.unreadCount ? html`
                  <div style="display: inline-block; background: #f44336; color: white; font-size: 11px; padding: 2px 6px; border-radius: 10px; margin-top: 2px;">
                    ${agent.unreadCount}
                  </div>
                ` : nothing}
              </div>
              
              <!-- 展开/折叠指示器 -->
              <div style="font-size: 12px; color: #666;">
                ${state.currentAgent?.id === agent.id ? '▼' : '▶'}
              </div>
            </div>
            
            <!-- 如果是当前智能助手，展示其好友和群组 -->
            ${state.currentAgent?.id === agent.id ? html`
              <div style="margin-left: 16px; margin-top: 4px;">
                <!-- 好友列表 -->
                ${state.friends.length > 0 ? html`
                  <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #666; padding: 6px 12px; font-weight: 600; text-transform: uppercase;">好友</div>
                    ${state.friends.map(friend => html`
                      <div
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          props.onConversationSelect('direct', friend.id);
                        }}
                        style="padding: 8px 12px;
                               margin-bottom: 2px;
                               border-radius: 6px;
                               cursor: pointer;
                               background: ${state.currentConversation?.conversationId === friend.id ? '#e8f5e9' : 'transparent'};
                               display: flex;
                               align-items: center;
                               gap: 8px;">
                        <div style="position: relative;">
                          <div style="width: 28px; height: 28px; border-radius: 50%; background: #4caf50; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">
                            ${friend.name.substring(0, 1).toUpperCase()}
                          </div>
                          <div style="position: absolute; bottom: 0; right: 0; width: 8px; height: 8px; border-radius: 50%; background: ${friend.status === 'online' ? '#4caf50' : friend.status === 'busy' ? '#ff9800' : '#9e9e9e'}; border: 2px solid #f8f9fa;"></div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                          <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${friend.name}</div>
                          ${friend.group ? html`
                            <div style="font-size: 10px; color: #999;">${friend.group}</div>
                          ` : nothing}
                        </div>
                        ${friend.unreadCount ? html`
                          <div style="background: #f44336; color: white; font-size: 10px; padding: 2px 5px; border-radius: 8px;">${friend.unreadCount}</div>
                        ` : nothing}
                      </div>
                    `)}
                  </div>
                ` : nothing}
                
                <!-- 群组列表 -->
                ${state.groups.length > 0 ? html`
                  <div>
                    <div style="font-size: 11px; color: #666; padding: 6px 12px; font-weight: 600; text-transform: uppercase;">群组</div>
                    ${state.groups.map(group => html`
                      <div
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          props.onConversationSelect('group', group.id);
                        }}
                        style="padding: 8px 12px;
                               margin-bottom: 2px;
                               border-radius: 6px;
                               cursor: pointer;
                               background: ${state.currentConversation?.conversationId === group.id ? '#fff3e0' : 'transparent'};
                               display: flex;
                               align-items: center;
                               gap: 8px;">
                        <div style="width: 28px; height: 28px; border-radius: 6px; background: #ff9800; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">
                          ${group.name.substring(0, 1).toUpperCase()}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                          <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${group.name}</div>
                          <div style="font-size: 10px; color: #999;">${group.memberCount} 成员</div>
                        </div>
                        ${group.unreadCount ? html`
                          <div style="background: #f44336; color: white; font-size: 10px; padding: 2px 5px; border-radius: 8px;">${group.unreadCount}</div>
                        ` : nothing}
                      </div>
                    `)}
                  </div>
                ` : nothing}
              </div>
            ` : nothing}
          `)}
        </div>
      ` : html`
        <!-- 折叠状态：只显示头像 -->
        <div style="flex: 1; overflow-y: auto; padding: 8px 0;">
          ${state.myAgents.map(agent => html`
            <div
              @click=${() => props.onAgentSelect(agent.id)}
              style="padding: 8px 10px;
                     cursor: pointer;
                     display: flex;
                     justify-content: center;
                     background: ${state.currentAgent?.id === agent.id ? '#e3f2fd' : 'transparent'};">
              <div style="position: relative;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #2196f3; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                  ${agent.name.substring(0, 1).toUpperCase()}
                </div>
                ${agent.unreadCount ? html`
                  <div style="position: absolute; top: -4px; right: -4px; background: #f44336; color: white; font-size: 10px; padding: 2px 5px; border-radius: 10px; min-width: 18px; text-align: center;">
                    ${agent.unreadCount}
                  </div>
                ` : nothing}
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

/**
 * 渲染聊天主区域
 */
function renderChatArea(props: ChatHubProps): TemplateResult {
  const { state } = props;
  
  if (!state.currentConversation || !state.currentAgent) {
    return html`
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #999;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
          <div style="font-size: 16px;">选择一个对话开始聊天</div>
        </div>
      </div>
    `;
  }
  
  return html`
    <div style="flex: 1; display: flex; flex-direction: column; background: white;">
      <!-- 对话头部 -->
      <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 12px;">
        <div style="width: 40px; height: 40px; border-radius: ${state.currentConversation.type === 'group' ? '8px' : '50%'}; background: ${state.currentConversation.type === 'group' ? '#ff9800' : '#4caf50'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          ${state.currentConversation.conversationName.substring(0, 1).toUpperCase()}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 15px;">${state.currentConversation.conversationName}</div>
          <div style="font-size: 12px; color: #666;">
            ${state.currentAgent.name} 
            ${state.currentConversation.type === 'direct' ? '与' : '在群组中'}
            ${state.currentConversation.type === 'group' ? html` · ${state.currentConversation.participants?.length || 0} 位成员` : ''}
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div style="display: flex; gap: 8px;">
          <button style="padding: 6px 12px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 13px;">
            📞 通话
          </button>
          <button style="padding: 6px 12px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 13px;">
            📹 视频
          </button>
          <button
            @click=${props.onToggleRightSidebar}
            style="padding: 6px 12px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 13px;">
            ℹ️ 详情
          </button>
        </div>
      </div>
      
      <!-- 消息列表 -->
      <div style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px;">
        ${state.messages.length === 0 ? html`
          <div style="text-align: center; color: #999; margin-top: 40px;">
            <div style="font-size: 32px; margin-bottom: 8px;">👋</div>
            <div>开始你们的对话吧！</div>
          </div>
        ` : state.messages.map(msg => renderMessage(msg, state.currentAgent!))}
      </div>
      
      <!-- 消息输入区 -->
      ${renderMessageInput(props)}
    </div>
  `;
}

/**
 * 渲染单条消息
 */
function renderMessage(message: Message, currentAgent: AgentInfo): TemplateResult {
  const isMyMessage = message.senderId === currentAgent.id;
  
  return html`
    <div style="display: flex; gap: 10px; flex-direction: ${isMyMessage ? 'row-reverse' : 'row'}; align-items: flex-start;">
      <!-- 发送者头像 -->
      <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isMyMessage ? '#2196f3' : '#4caf50'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; flex-shrink: 0;">
        ${message.senderName.substring(0, 1).toUpperCase()}
      </div>
      
      <!-- 消息内容 -->
      <div style="max-width: 60%; display: flex; flex-direction: column; gap: 4px; align-items: ${isMyMessage ? 'flex-end' : 'flex-start'};">
        <div style="font-size: 11px; color: #666; padding: 0 8px;">
          ${message.senderName} · ${new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        
        <div style="background: ${isMyMessage ? '#e3f2fd' : '#f5f5f5'}; padding: 10px 14px; border-radius: 12px; word-break: break-word;">
          ${renderMessageContent(message)}
        </div>
        
        <!-- 表情回应 -->
        ${message.reactions && message.reactions.length > 0 ? html`
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${message.reactions.map(reaction => html`
              <div style="background: white; border: 1px solid #e0e0e0; border-radius: 12px; padding: 2px 6px; font-size: 11px; display: flex; align-items: center; gap: 3px;">
                <span>${reaction.emoji}</span>
                <span style="color: #666;">${reaction.count}</span>
              </div>
            `)}
          </div>
        ` : nothing}
      </div>
    </div>
  `;
}

/**
 * 渲染消息内容（根据类型）
 */
function renderMessageContent(message: Message): TemplateResult {
  switch (message.type) {
    case 'text':
      return html`<div>${message.content}</div>`;
    
    case 'code':
      return html`
        <pre style="background: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 0; font-family: 'Consolas', monospace; font-size: 12px;"><code>${message.content}</code></pre>
      `;
    
    case 'task':
      return html`
        <div style="border-left: 3px solid #4caf50; padding-left: 12px;">
          <div style="font-weight: 600; margin-bottom: 4px;">📋 任务引用</div>
          <div style="font-size: 13px;">${message.content}</div>
        </div>
      `;
    
    case 'meeting':
      return html`
        <div style="border-left: 3px solid #2196f3; padding-left: 12px;">
          <div style="font-weight: 600; margin-bottom: 4px;">📅 会议邀请</div>
          <div style="font-size: 13px;">${message.content}</div>
        </div>
      `;
    
    default:
      return html`<div>${message.content}</div>`;
  }
}

/**
 * 渲染消息输入区
 */
function renderMessageInput(props: ChatHubProps): TemplateResult {
  let inputValue = '';
  
  return html`
    <div style="border-top: 1px solid #e0e0e0; padding: 16px 20px;">
      <!-- 工具栏 -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button style="padding: 6px 10px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 12px;">
          📎 附件
        </button>
        <button style="padding: 6px 10px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 12px;">
          📋 任务
        </button>
        <button style="padding: 6px 10px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 12px;">
          📅 会议
        </button>
        <button style="padding: 6px 10px; border: 1px solid #d0d0d0; border-radius: 6px; background: white; cursor: pointer; font-size: 12px;">
          💻 代码
        </button>
      </div>
      
      <!-- 输入框 -->
      <div style="display: flex; gap: 12px; align-items: flex-end;">
        <textarea
          placeholder="输入消息...  (Ctrl/Cmd + Enter 发送)"
          @input=${(e: Event) => { inputValue = (e.target as HTMLTextAreaElement).value; }}
          @keydown=${(e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              if (inputValue.trim()) {
                props.onSendMessage(inputValue, 'text');
                (e.target as HTMLTextAreaElement).value = '';
                inputValue = '';
              }
            }
          }}
          style="flex: 1; min-height: 60px; max-height: 150px; padding: 12px; border: 1px solid #d0d0d0; border-radius: 8px; resize: vertical; font-size: 14px; font-family: inherit;"
        ></textarea>
        <button
          @click=${() => {
            const textarea = document.querySelector('textarea');
            if (textarea && textarea.value.trim()) {
              props.onSendMessage(textarea.value, 'text');
              textarea.value = '';
              inputValue = '';
            }
          }}
          style="padding: 12px 24px; background: #2196f3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;">
          发送
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染对话信息侧边栏
 */
function renderConversationSidebar(props: ChatHubProps): TemplateResult {
  const { state } = props;
  
  if (state.rightSidebarCollapsed || !state.currentConversation) {
    return nothing;
  }
  
  return html`
    <div style="width: 300px; background: #f8f9fa; border-left: 1px solid #e0e0e0; overflow-y: auto;">
      <!-- 头部 -->
      <div style="padding: 16px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 600; font-size: 14px;">对话信息</span>
        <button
          @click=${props.onToggleRightSidebar}
          style="background: transparent; border: none; cursor: pointer; padding: 4px; font-size: 16px;">
          ✕
        </button>
      </div>
      
      <!-- 参与者 -->
      ${state.currentConversation.type === 'group' && state.currentConversation.participants ? html`
        <div style="padding: 16px; border-bottom: 1px solid #e0e0e0;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 12px;">成员 (${state.currentConversation.participants.length})</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${state.currentConversation.participants.map(participant => html`
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="position: relative;">
                  <div style="width: 32px; height: 32px; border-radius: 50%; background: #2196f3; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">
                    ${participant.name.substring(0, 1).toUpperCase()}
                  </div>
                  <div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; background: ${participant.status === 'online' ? '#4caf50' : participant.status === 'busy' ? '#ff9800' : '#9e9e9e'}; border: 2px solid #f8f9fa;"></div>
                </div>
                <div style="flex: 1;">
                  <div style="font-size: 13px; font-weight: 500;">${participant.name}</div>
                  <div style="font-size: 11px; color: #666;">${participant.status === 'online' ? '在线' : participant.status === 'busy' ? '忙碌' : '离线'}</div>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}
      
      <!-- 共享文件 -->
      ${state.currentConversation.sharedFiles && state.currentConversation.sharedFiles.length > 0 ? html`
        <div style="padding: 16px; border-bottom: 1px solid #e0e0e0;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 12px;">共享文件</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${state.currentConversation.sharedFiles.map(file => html`
              <div style="padding: 10px; background: white; border-radius: 6px; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <div style="font-size: 24px;">📄</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</div>
                  <div style="font-size: 10px; color: #999;">${new Date(file.sharedAt).toLocaleDateString('zh-CN')}</div>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}
      
      <!-- 协作任务 -->
      ${state.currentConversation.tasks && state.currentConversation.tasks.length > 0 ? html`
        <div style="padding: 16px; border-bottom: 1px solid #e0e0e0;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 12px;">协作任务</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${state.currentConversation.tasks.map(task => html`
              <div style="padding: 10px; background: white; border-radius: 6px; cursor: pointer;">
                <div style="font-size: 12px; font-weight: 500; margin-bottom: 4px;">${task.title}</div>
                <div style="font-size: 11px; color: ${task.status === 'done' ? '#4caf50' : task.status === 'in-progress' ? '#2196f3' : '#999'};">
                  ${task.status === 'done' ? '✓ 已完成' : task.status === 'in-progress' ? '⏳ 进行中' : '○ 待办'}
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}
      
      <!-- 相关项目 -->
      ${state.currentConversation.projects && state.currentConversation.projects.length > 0 ? html`
        <div style="padding: 16px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 12px;">相关项目</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${state.currentConversation.projects.map(project => html`
              <div style="padding: 10px; background: white; border-radius: 6px; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="font-size: 20px;">📁</div>
                  <div style="font-size: 12px; font-weight: 500;">${project.name}</div>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}
    </div>
  `;
}

/**
 * 主渲染函数
 */
export function renderAgentChatHub(props: ChatHubProps): TemplateResult {
  return html`
    <div style="display: flex; height: 100%; overflow: hidden;">
      ${renderAgentSidebar(props)}
      ${renderChatArea(props)}
      ${renderConversationSidebar(props)}
    </div>
  `;
}
