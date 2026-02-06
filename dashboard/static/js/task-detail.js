// 任务详情组件
class TaskDetail {
  constructor() {
    this.modal = document.getElementById('taskDetailModal');
    this.content = document.getElementById('taskDetailContent');
    this.title = document.getElementById('taskDetailTitle');
    if (!this.modal || !this.content || !this.title) return;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const closeBtn = document.getElementById('closeTaskDetail');
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

  async show(taskId) {
    if (!this.modal || !this.content) return;
    this.modal.style.display = 'block';
    this.content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const response = await fetch(`/api/tasks/${taskId}/details`);
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const task = await response.json();
      this.render(task);
    } catch (error) {
      console.error('加载任务详情失败:', error);
      this.content.innerHTML = `
        <div class="error-state">
          <div style="font-size: 1.2em; margin-bottom: 8px;">❌ 加载失败</div>
          <div style="font-size: 0.9em; color: var(--text-secondary);">${error.message}</div>
        </div>
      `;
    }
  }

  render(task) {
    const taskTitle = task.title || '(无标题)';
    if (this.title) this.title.textContent = `📌 ${taskTitle}`;

    const html = `
      <div class="detail-section">
        <h3>任务信息</h3>
        <div class="detail-grid">
          <div class="detail-item" style="grid-column: span 2;">
            <span class="detail-label">任务标题</span>
            <span class="detail-value" style="font-weight: 600; font-size: 1.05em;">${this.formatMessage(taskTitle)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">任务ID</span>
            <span class="detail-value">${task.id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Agent</span>
            <span class="detail-value">${task.agentName} (${task.agentId})</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">状态</span>
            <span class="badge ${task.status === 'completed' ? 'badge-green' : 'badge-blue'}">
              ${task.status === 'completed' ? '已完成' : '进行中'}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">消息数</span>
            <span class="detail-value">${task.messageCount}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">创建时间</span>
            <span class="detail-value">${new Date(task.createdAt).toLocaleString('zh-CN')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">完成时间</span>
            <span class="detail-value">${task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : 'N/A'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">执行时长</span>
            <span class="detail-value">${task.duration}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>消息统计</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${task.summary ? task.summary.userMessages : 0}</div>
            <div class="stat-label">用户消息</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${task.summary ? task.summary.assistantMessages : 0}</div>
            <div class="stat-label">助手消息</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${task.summary ? task.summary.systemMessages : 0}</div>
            <div class="stat-label">系统消息</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>消息历史</h3>
        <div class="messages-container">
          ${(task.messages || []).length > 0 ? (task.messages || []).map((msg, index) => `
            <div class="message-item message-${msg.role}">
              <div class="message-header">
                <span class="message-role">${msg.senderEmoji || this.getRoleEmoji(msg.role)} ${msg.senderName || this.getRoleName(msg.role)}</span>
                <span class="message-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : ''}</span>
              </div>
              <div class="message-content">${this.formatMessage(msg.content)}</div>
            </div>
          `).join('') : '<div class="empty-state">暂无消息</div>'}
        </div>
      </div>
    `;

    this.content.innerHTML = html;
  }

  getRoleLabel(role) {
    const labels = {
      user: '👤 用户',
      assistant: '🤖 助手',
      system: '⚙️ 系统'
    };
    return labels[role] || role;
  }

  getRoleEmoji(role) {
    const emojis = { user: '👤', assistant: '🤖', system: '⚙️' };
    return emojis[role] || '💬';
  }

  getRoleName(role) {
    const names = { user: '用户', assistant: '助手', system: '系统' };
    return names[role] || role;
  }

  formatMessage(content) {
    if (!content) return '<em>空消息</em>';
    // 转义HTML
    const div = document.createElement('div');
    div.textContent = content;
    const escaped = div.innerHTML;
    // 简单的格式化：换行处理
    return escaped.replace(/\n/g, '<br>');
  }

  close() {
    if (this.modal) this.modal.style.display = 'none';
  }
}

// 全局函数，供dashboard.js调用
window.showTaskDetail = function(taskId) {
  if (!window.taskDetailInstance) {
    window.taskDetailInstance = new TaskDetail();
  }
  window.taskDetailInstance.show(taskId);
};
