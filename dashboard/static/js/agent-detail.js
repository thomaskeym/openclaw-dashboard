// Agent详情组件
class AgentDetail {
  constructor() {
    this.modal = document.getElementById('agentDetailModal');
    this.content = document.getElementById('agentDetailContent');
    this.title = document.getElementById('agentDetailTitle');
    if (!this.modal || !this.content || !this.title) return;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const closeBtn = document.getElementById('closeAgentDetail');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 点击模态框外部关闭
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display === 'block') {
        this.close();
      }
    });
  }

  async show(agentId) {
    if (!this.modal || !this.content) return;
    this.modal.style.display = 'block';
    this.content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const response = await fetch(`/api/agents/${agentId}/details`);
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const agent = await response.json();
      this.render(agent);
    } catch (error) {
      console.error('加载Agent详情失败:', error);
      this.content.innerHTML = `
        <div class="error-state">
          <div style="font-size: 1.2em; margin-bottom: 8px;">❌ 加载失败</div>
          <div style="font-size: 0.9em; color: var(--text-secondary);">${error.message}</div>
        </div>
      `;
    }
  }

  render(agent) {
    if (this.title) this.title.textContent = `${agent.emoji || ''} ${agent.name} - 详情`;

    const html = `
      <div class="detail-section">
        <h3>基本信息</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Agent ID</span>
            <span class="detail-value">${agent.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">名称</span>
            <span class="detail-value">${agent.name}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">状态</span>
            <span class="badge ${agent.status === 'active' ? 'badge-green' : 'badge-yellow'}">
              ${agent.status === 'active' ? '活跃' : '空闲'}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">模型</span>
            <span class="detail-value">${agent.model}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">工作空间</span>
            <span class="detail-value">${agent.workspace}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">会话数</span>
            <span class="detail-value">${agent.sessionCount}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">总消息数</span>
            <span class="detail-value">${agent.totalMessages}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">最后活动</span>
            <span class="detail-value">${agent.lastActivity ? new Date(agent.lastActivity).toLocaleString('zh-CN') : 'N/A'}</span>
          </div>
        </div>
      </div>

      ${agent.subagents && agent.subagents.length > 0 ? `
        <div class="detail-section">
          <h3>子Agent</h3>
          <div class="subagents-list">
            ${agent.subagents.map(sub => `<span class="badge badge-blue">${sub}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h3>配置信息</h3>
        <div class="config-info">
          <div class="config-item">
            <span class="config-label">系统提示词</span>
            <div class="config-value">${this.escapeHtml((agent.config && agent.config.systemPrompt) || '未配置')}</div>
          </div>
          <div class="config-item">
            <span class="config-label">温度</span>
            <span class="config-value">${(agent.config && agent.config.temperature) ?? 'N/A'}</span>
          </div>
          <div class="config-item">
            <span class="config-label">最大Token数</span>
            <span class="config-value">${(agent.config && agent.config.maxTokens) ?? 'N/A'}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>会话列表 (最近${(agent.sessions || []).length}个)</h3>
        <div class="sessions-list">
          ${(agent.sessions || []).length > 0 ? (agent.sessions || []).map(session => `
            <div class="session-item clickable" onclick="window.agentDetailInstance.showSession('${agent.id}', '${session.id}')" style="cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(59, 130, 246, 0.05)'; this.style.transform='translateX(4px)';" onmouseout="this.style.background=''; this.style.transform='';">
              <div class="session-header">
                <span class="session-id">🗂️ ${session.id.substring(0, 16)}...</span>
                <span class="badge badge-info">${session.messageCount} 条消息</span>
                <span style="margin-left: auto; font-size: 0.8em; color: var(--accent);">点击查看 →</span>
              </div>
              <div class="session-info">
                <div>创建: ${new Date(session.createdAt).toLocaleString('zh-CN')}</div>
                <div>更新: ${new Date(session.updatedAt).toLocaleString('zh-CN')}</div>
              </div>
              <div class="session-preview">
                <div class="preview-label">首条:</div>
                <div class="preview-content">${this.escapeHtml(String(session.firstMessage || '')).substring(0, 80)}${(session.firstMessage || '').length > 80 ? '...' : ''}</div>
              </div>
            </div>
          `).join('') : '<div class="empty-state">暂无会话</div>'}
        </div>
      </div>
      
    `;

    this.content.innerHTML = html;
    this.currentAgentId = agent.id;
  }

  async showSession(agentId, sessionId) {
    // 创建会话详情模态框
    let sessionModal = document.getElementById('sessionDetailModal');
    if (!sessionModal) {
      sessionModal = document.createElement('div');
      sessionModal.id = 'sessionDetailModal';
      sessionModal.innerHTML = `
        <div class="session-modal-overlay" onclick="window.agentDetailInstance.hideSessionDetail()"></div>
        <div class="session-modal-content">
          <div class="session-modal-header">
            <h2 id="sessionModalTitle">会话详情</h2>
            <button class="session-modal-close" onclick="window.agentDetailInstance.hideSessionDetail()">×</button>
          </div>
          <div class="session-modal-body" id="sessionModalBody">
            <div class="loading">加载中...</div>
          </div>
        </div>
      `;
      document.body.appendChild(sessionModal);
      
      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        #sessionDetailModal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
        }
        #sessionDetailModal .session-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }
        #sessionDetailModal .session-modal-content {
          position: absolute;
          top: 3%;
          left: 5%;
          right: 5%;
          bottom: 3%;
          background: var(--card-bg, #fff);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }
        #sessionDetailModal .session-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: var(--bg-secondary, #f8fafc);
        }
        #sessionDetailModal .session-modal-header h2 {
          margin: 0;
          font-size: 1.1em;
          color: var(--text-primary, #1e293b);
        }
        #sessionDetailModal .session-modal-close {
          width: 36px;
          height: 36px;
          border: none;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          font-size: 1.5em;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        #sessionDetailModal .session-modal-close:hover {
          background: #ef4444;
          color: white;
        }
        #sessionDetailModal .session-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
        }
        .message-item {
          margin-bottom: 16px;
          padding: 16px;
          border-radius: 12px;
          border-left: 4px solid;
        }
        .message-item.user {
          background: rgba(59, 130, 246, 0.08);
          border-left-color: #3b82f6;
        }
        .message-item.assistant {
          background: rgba(16, 185, 129, 0.08);
          border-left-color: #10b981;
        }
        .message-item.system {
          background: rgba(245, 158, 11, 0.08);
          border-left-color: #f59e0b;
        }
        .message-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .message-icon {
          font-size: 1.3em;
        }
        .message-role {
          font-weight: 600;
          font-size: 0.9em;
        }
        .message-meta {
          margin-left: auto;
          font-size: 0.75em;
          color: var(--text-secondary, #64748b);
        }
        .message-content {
          font-size: 0.95em;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;
      document.head.appendChild(style);
    }
    
    sessionModal.style.display = 'block';
    const modalTitle = document.getElementById('sessionModalTitle');
    const modalBody = document.getElementById('sessionModalBody');
    if (modalTitle) modalTitle.textContent = `📝 会话: ${sessionId.substring(0, 24)}...`;
    if (modalBody) modalBody.innerHTML = '<div class="loading">加载消息中...</div>';
    
    // ESC 关闭
    this._sessionEscHandler = (e) => {
      if (e.key === 'Escape') this.hideSessionDetail();
    };
    document.addEventListener('keydown', this._sessionEscHandler);
    
    try {
      const response = await fetch(`/api/agents/${agentId}/sessions/${sessionId}`);
      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
      
      const data = await response.json();
      this.renderSessionMessages(data.messages, {
        agentName: data.agentName,
        agentEmoji: data.agentEmoji,
        agentRole: data.agentRole
      });
    } catch (error) {
      console.error('加载会话详情失败:', error);
      const errBody = document.getElementById('sessionModalBody');
      if (errBody) errBody.innerHTML = `<div class="error-state">❌ 加载失败: ${error.message}</div>`;
    }
  }

  renderSessionMessages(messages, sessionInfo = {}) {
    const container = document.getElementById('sessionModalBody');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无消息</div>';
      return;
    }

    // 按时间从近到远（新→旧）排序
    const sorted = [...messages].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    const html = sorted.map((msg, index) => {
      const isUser = msg.role === 'user';
      const isAssistant = msg.role === 'assistant';
      const isSystem = msg.role === 'system' || msg.type === 'system';
      
      let roleClass = 'system';
      if (isUser) roleClass = 'user';
      else if (isAssistant) roleClass = 'assistant';
      
      // 使用后端返回的发送者信息
      const icon = msg.senderEmoji || (isUser ? '👤' : isAssistant ? '🤖' : '⚙️');
      const roleText = msg.senderName || (isUser ? '用户' : isAssistant ? '助手' : '系统');

      const content = msg.content || msg.text || msg.message?.content || JSON.stringify(msg).substring(0, 500);
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : '';

      return `
        <div class="message-item ${roleClass}">
          <div class="message-header">
            <span class="message-icon">${icon}</span>
            <span class="message-role">${roleText}</span>
            <span class="message-meta">#${index + 1} · ${timestamp}</span>
          </div>
          <div class="message-content">${this.escapeHtml(String(content))}</div>
        </div>
      `;
    }).join('');

    // 显示 agent 信息
    const agentInfo = sessionInfo.agentName ? 
      `<span style="margin-left: 16px; color: var(--text-secondary);">${sessionInfo.agentEmoji || '🤖'} ${sessionInfo.agentName}</span>` : '';

    container.innerHTML = `
      <div style="margin-bottom: 16px; padding: 12px 16px; background: var(--bg-secondary, #f1f5f9); border-radius: 10px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.2em;">📊</span>
        <span style="font-weight: 500;">共 ${messages.length} 条消息</span>
        ${agentInfo}
      </div>
      ${html}
    `;
  }

  hideSessionDetail() {
    const sessionModal = document.getElementById('sessionDetailModal');
    if (sessionModal) {
      sessionModal.style.display = 'none';
    }
    if (this._sessionEscHandler) {
      document.removeEventListener('keydown', this._sessionEscHandler);
    }
  }

  close() {
    if (this.modal) this.modal.style.display = 'none';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 全局函数，供dashboard.js调用
window.showAgentDetail = function(agentId) {
  if (!window.agentDetailInstance) {
    window.agentDetailInstance = new AgentDetail();
  }
  window.agentDetailInstance.show(agentId);
};
