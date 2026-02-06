/**
 * 搜索和过滤功能模块
 * 提供日志搜索、任务过滤、Agent搜索和全局搜索功能
 */

class SearchManager {
  constructor() {
    this.logsCache = [];
    this.tasksCache = [];
    this.agentsCache = [];
    this.currentFilters = {
      logs: { keyword: '', level: 'all', timeRange: null },
      tasks: { keyword: '', agent: 'all', status: 'all', timeRange: null },
      agents: { keyword: '', status: 'all' },
      global: { keyword: '' }
    };
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 全局搜索框
    const globalSearchInput = document.getElementById('globalSearch');
    if (globalSearchInput) {
      globalSearchInput.addEventListener('input', (e) => {
        this.handleGlobalSearch(e.target.value);
      });
    }

    // 日志搜索
    const logSearchInput = document.getElementById('logSearch');
    if (logSearchInput) {
      logSearchInput.addEventListener('input', (e) => {
        this.currentFilters.logs.keyword = e.target.value;
        this.filterLogs();
      });
    }

    const logLevelFilter = document.getElementById('logLevelFilter');
    if (logLevelFilter) {
      logLevelFilter.addEventListener('change', (e) => {
        this.currentFilters.logs.level = e.target.value;
        this.filterLogs();
      });
    }

    // 任务过滤
    const taskSearchInput = document.getElementById('taskSearch');
    if (taskSearchInput) {
      taskSearchInput.addEventListener('input', (e) => {
        this.currentFilters.tasks.keyword = e.target.value;
        this.filterTasks();
      });
    }

    const taskAgentFilter = document.getElementById('taskAgentFilter');
    if (taskAgentFilter) {
      taskAgentFilter.addEventListener('change', (e) => {
        this.currentFilters.tasks.agent = e.target.value;
        this.filterTasks();
      });
    }

    const taskStatusFilter = document.getElementById('taskStatusFilter');
    if (taskStatusFilter) {
      taskStatusFilter.addEventListener('change', (e) => {
        this.currentFilters.tasks.status = e.target.value;
        this.filterTasks();
      });
    }

    // Agent搜索
    const agentSearchInput = document.getElementById('agentSearch');
    if (agentSearchInput) {
      agentSearchInput.addEventListener('input', (e) => {
        this.currentFilters.agents.keyword = e.target.value;
        this.filterAgents();
      });
    }

    const agentStatusFilter = document.getElementById('agentStatusFilter');
    if (agentStatusFilter) {
      agentStatusFilter.addEventListener('change', (e) => {
        this.currentFilters.agents.status = e.target.value;
        this.filterAgents();
      });
    }
  }

  // 全局搜索
  handleGlobalSearch(keyword) {
    this.currentFilters.global.keyword = keyword;
    
    if (!keyword.trim()) {
      // 清空搜索，恢复原始显示
      if (window.dashboard) {
        window.dashboard.updateAllPanels();
      }
      return;
    }

    // 在所有面板中搜索
    this.searchInLogs(keyword);
    this.searchInTasks(keyword);
    this.searchInAgents(keyword);
  }

  // 日志搜索和过滤
  filterLogs() {
    const container = document.getElementById('logContainer');
    if (!container || this.logsCache.length === 0) return;

    const filter = this.currentFilters.logs;
    let filtered = [...this.logsCache];

    // 关键词搜索（支持正则表达式）
    if (filter.keyword.trim()) {
      try {
        const regex = new RegExp(filter.keyword, 'i');
        filtered = filtered.filter(log => regex.test(log.message));
      } catch (e) {
        // 如果不是有效的正则表达式，使用普通搜索
        const keyword = filter.keyword.toLowerCase();
        filtered = filtered.filter(log => 
          log.message.toLowerCase().includes(keyword)
        );
      }
    }

    // 日志级别过滤
    if (filter.level !== 'all') {
      filtered = filtered.filter(log => log.level === filter.level);
    }

    // 时间范围过滤
    if (filter.timeRange) {
      const now = Date.now();
      const rangeMs = filter.timeRange * 60 * 1000; // 转换为毫秒
      filtered = filtered.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return (now - logTime) <= rangeMs;
      });
    }

    // 渲染过滤后的日志（高亮关键词）
    this.renderFilteredLogs(filtered, filter.keyword);
  }

  renderFilteredLogs(logs, keyword) {
    const container = document.getElementById('logContainer');
    if (!container) return;

    const html = logs.map(log => {
      const levelClass = log.level === 'error' ? 'log-error' : 
                        log.level === 'warn' ? 'log-warn' : 'log-info';
      const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
      
      // 高亮关键词
      let message = this.escapeHtml(log.message);
      if (keyword.trim()) {
        try {
          const regex = new RegExp(`(${keyword})`, 'gi');
          message = message.replace(regex, '<mark>$1</mark>');
        } catch (e) {
          const keywordEscaped = this.escapeHtml(keyword);
          const regex = new RegExp(`(${keywordEscaped})`, 'gi');
          message = message.replace(regex, '<mark>$1</mark>');
        }
      }

      return `<div class="log-entry ${levelClass}">
        <span class="log-time">${time}</span>
        ${message}
      </div>`;
    }).join('');

    container.innerHTML = html;
  }

  // 更新日志缓存
  updateLogsCache(logs) {
    this.logsCache = logs;
    this.filterLogs();
  }

  // 任务过滤
  filterTasks() {
    const filter = this.currentFilters.tasks;
    
    // 获取当前显示的任务
    const currentTasksContainer = document.getElementById('currentTasks');
    const historyTasksContainer = document.getElementById('taskHistory');
    
    if (!currentTasksContainer && !historyTasksContainer) return;

    // 从dashboard数据中获取任务
    if (!window.dashboard || !window.dashboard.data || !window.dashboard.data.tasks) {
      return;
    }

    const allTasks = [
      ...(window.dashboard.data.tasks.current || []),
      ...(window.dashboard.data.tasks.history || [])
    ];

    let filtered = [...allTasks];

    // 关键词搜索（任务ID）
    if (filter.keyword.trim()) {
      const keyword = filter.keyword.toLowerCase();
      filtered = filtered.filter(task => 
        task.id.toLowerCase().includes(keyword) ||
        task.agentName.toLowerCase().includes(keyword) ||
        task.agentId.toLowerCase().includes(keyword)
      );
    }

    // Agent过滤
    if (filter.agent !== 'all') {
      filtered = filtered.filter(task => task.agentId === filter.agent);
    }

    // 状态过滤
    if (filter.status === 'current') {
      filtered = filtered.filter(task => 
        window.dashboard.data.tasks.current.some(t => t.id === task.id)
      );
    } else if (filter.status === 'completed') {
      filtered = filtered.filter(task => 
        window.dashboard.data.tasks.history.some(t => t.id === task.id)
      );
    }

    // 时间范围过滤
    if (filter.timeRange) {
      const now = Date.now();
      const rangeMs = filter.timeRange * 60 * 1000;
      filtered = filtered.filter(task => {
        const taskTime = new Date(task.lastUpdate).getTime();
        return (now - taskTime) <= rangeMs;
      });
    }

    // 分离当前和历史任务
    const current = filtered.filter(task => 
      window.dashboard.data.tasks.current.some(t => t.id === task.id)
    );
    const history = filtered.filter(task => 
      window.dashboard.data.tasks.history.some(t => t.id === task.id)
    );

    // 渲染
    this.renderFilteredTasks(current, history);
  }

  renderFilteredTasks(current, history) {
    const currentContainer = document.getElementById('currentTasks');
    const historyContainer = document.getElementById('taskHistory');

    if (currentContainer) {
      if (current.length === 0) {
        currentContainer.innerHTML = '<div class="empty-state">无匹配的当前任务</div>';
      } else {
        const html = current.slice(0, 10).map(task => `
          <div class="task-item clickable" onclick="window.showTaskDetail('${task.id}')">
            <div class="task-header">
              <span><strong>${task.agentName}</strong></span>
              <span class="badge badge-blue">进行中</span>
            </div>
            <div class="task-id">任务ID: ${this.highlightKeyword(task.id.substring(0, 8), this.currentFilters.tasks.keyword)}...</div>
            <div class="task-time">消息数: ${task.messageCount} | 更新: ${new Date(task.lastUpdate).toLocaleString('zh-CN')}</div>
          </div>
        `).join('');
        currentContainer.innerHTML = html;
      }
    }

    if (historyContainer) {
      if (history.length === 0) {
        historyContainer.innerHTML = '<div class="empty-state">无匹配的历史任务</div>';
      } else {
        const html = history.slice(0, 10).map(task => `
          <div class="task-item clickable" onclick="window.showTaskDetail('${task.id}')">
            <div class="task-header">
              <span><strong>${task.agentName}</strong></span>
              <span class="badge badge-green">已完成</span>
            </div>
            <div class="task-id">任务ID: ${this.highlightKeyword(task.id.substring(0, 8), this.currentFilters.tasks.keyword)}...</div>
            <div class="task-time">消息数: ${task.messageCount} | 完成: ${new Date(task.lastUpdate).toLocaleString('zh-CN')}</div>
          </div>
        `).join('');
        historyContainer.innerHTML = html;
      }
    }
  }

  // Agent搜索和过滤
  filterAgents() {
    const filter = this.currentFilters.agents;
    const container = document.getElementById('agentsList');
    if (!container) return;

    if (!window.dashboard || !window.dashboard.data || !window.dashboard.data.agents) {
      return;
    }

    let filtered = [...window.dashboard.data.agents];

    // 关键词搜索（名称或ID）
    if (filter.keyword.trim()) {
      const keyword = filter.keyword.toLowerCase();
      filtered = filtered.filter(agent => 
        agent.name.toLowerCase().includes(keyword) ||
        agent.id.toLowerCase().includes(keyword)
      );
    }

    // 状态过滤
    if (filter.status !== 'all') {
      filtered = filtered.filter(agent => agent.status === filter.status);
    }

    // 渲染
    this.renderFilteredAgents(filtered);
  }

  renderFilteredAgents(agents) {
    const container = document.getElementById('agentsList');
    if (!container) return;

    if (agents.length === 0) {
      container.innerHTML = '<div class="empty-state">无匹配的Agent</div>';
      return;
    }

    const html = agents.map(agent => {
      const nameHighlighted = this.highlightKeyword(agent.name, this.currentFilters.agents.keyword);
      const idHighlighted = this.highlightKeyword(agent.id, this.currentFilters.agents.keyword);

      return `
        <div class="agent-item clickable" data-agent-id="${agent.id}" onclick="window.showAgentDetail('${agent.id}')">
          <div class="agent-header">
            <span class="agent-emoji">${agent.emoji}</span>
            <span class="agent-name">${nameHighlighted}</span>
            <span class="badge ${agent.status === 'active' ? 'badge-green' : 'badge-yellow'}">
              ${agent.status === 'active' ? '活跃' : '空闲'}
            </span>
          </div>
          <div class="agent-details">
            <div><strong>ID:</strong> ${idHighlighted}</div>
            <div><strong>模型:</strong> ${agent.model}</div>
            <div><strong>会话数:</strong> ${agent.sessionCount}</div>
            <div><strong>最后活动:</strong> ${agent.lastActivity ? new Date(agent.lastActivity).toLocaleString('zh-CN') : 'N/A'}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  // 在日志中搜索
  searchInLogs(keyword) {
    this.currentFilters.logs.keyword = keyword;
    this.filterLogs();
  }

  // 在任务中搜索
  searchInTasks(keyword) {
    this.currentFilters.tasks.keyword = keyword;
    this.filterTasks();
  }

  // 在Agent中搜索
  searchInAgents(keyword) {
    this.currentFilters.agents.keyword = keyword;
    this.filterAgents();
  }

  // 高亮关键词
  highlightKeyword(text, keyword) {
    if (!keyword || !keyword.trim()) return this.escapeHtml(text);
    
    const escapedText = this.escapeHtml(text);
    try {
      const regex = new RegExp(`(${keyword})`, 'gi');
      return escapedText.replace(regex, '<mark>$1</mark>');
    } catch (e) {
      const keywordEscaped = this.escapeHtml(keyword);
      const regex = new RegExp(`(${keywordEscaped})`, 'gi');
      return escapedText.replace(regex, '<mark>$1</mark>');
    }
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 清除所有过滤器
  clearAllFilters() {
    this.currentFilters = {
      logs: { keyword: '', level: 'all', timeRange: null },
      tasks: { keyword: '', agent: 'all', status: 'all', timeRange: null },
      agents: { keyword: '', status: 'all' },
      global: { keyword: '' }
    };

    // 清空搜索框
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) globalSearch.value = '';
    const logSearch = document.getElementById('logSearch');
    if (logSearch) logSearch.value = '';
    const taskSearch = document.getElementById('taskSearch');
    if (taskSearch) taskSearch.value = '';
    const agentSearch = document.getElementById('agentSearch');
    if (agentSearch) agentSearch.value = '';

    // 恢复原始显示
    if (window.dashboard) {
      window.dashboard.updateAllPanels();
    }
  }
}

// 创建全局搜索管理器实例
window.searchManager = new SearchManager();
