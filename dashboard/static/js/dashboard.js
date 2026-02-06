class Dashboard {
  constructor() {
    this.ws = null;
    this.autoScroll = true;
    this.data = {};
    this.init();
  }

  init() {
    this.setupWebSocket();
    this.setupEventListeners();
    this.loadInitialData();
    this.startClock();
    this.startPolling(); // 启动轮询作为备选方案
  }

  // 设置WebSocket连接
  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket连接已建立');
        this.updateConnectionStatus('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('解析WebSocket消息失败:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        this.updateConnectionStatus('error');
        // WebSocket连接失败不影响主要功能，只显示警告
      };

      this.ws.onclose = () => {
        console.log('WebSocket连接已关闭');
        this.updateConnectionStatus('disconnected');
        // 5秒后重连
        setTimeout(() => {
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.setupWebSocket();
          }
        }, 5000);
      };
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      this.updateConnectionStatus('error');
      // WebSocket失败不影响主要功能，继续使用轮询
    }
  }

  // 处理WebSocket消息
  handleWebSocketMessage(message) {
    if (message.type === 'update' && message.data) {
      this.data = { ...this.data, ...message.data };
      this.updateAllPanels();
    } else if (message.type === 'config-changed') {
      this.loadInitialData();
    } else if (message.type === 'alert' && message.data) {
      // 处理告警通知
      if (window.notificationCenter && message.data.alerts) {
        message.data.alerts.forEach(alert => {
          window.notificationCenter.addNotification({
            title: `告警: ${alert.ruleName}`,
            message: alert.message,
            type: alert.severity === 'critical' ? 'error' : 
                  alert.severity === 'warning' ? 'warning' : 'info'
          });
        });
      }
    }
  }

  // 更新连接状态
  updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionStatus');
    if (!indicator) return;
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('span:last-child');
    if (!dot || !text) return;

    dot.className = 'status-dot';
    if (status === 'connected') {
      dot.classList.add('connected');
      text.textContent = '已连接';
    } else if (status === 'disconnected') {
      dot.classList.add('disconnected');
      text.textContent = '已断开';
    } else if (status === 'error') {
      dot.classList.add('disconnected');
      text.textContent = '连接错误';
    } else {
      text.textContent = '连接中...';
    }
  }

  // 设置事件监听器
  setupEventListeners() {
    // 日志清空按钮（日志面板中的，通过父元素查找）
    const logPanel = document.querySelector('.card.full-width .card-actions');
    if (logPanel) {
      const clearLogsBtn = logPanel.querySelector('#clearLogs');
      if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
          const lc = document.getElementById('logContainer');
          if (lc) lc.innerHTML = '';
        });
      }
    }

    const toggleAutoScrollBtn = document.getElementById('toggleAutoScroll');
    if (toggleAutoScrollBtn) {
      toggleAutoScrollBtn.addEventListener('click', (e) => {
        this.autoScroll = !this.autoScroll;
        e.target.textContent = `自动滚动: ${this.autoScroll ? 'ON' : 'OFF'}`;
      });
    }

    // 快捷操作按钮
    this.setupQuickActions();
  }

  // 设置快捷操作
  setupQuickActions() {
    // 重启Gateway
    const restartBtn = document.getElementById('restartGateway');
    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        if (!confirm('确定要重启Gateway吗？这可能会中断正在进行的任务。')) {
          return;
        }
        await this.executeAction('restart-gateway', '重启Gateway');
      });
    }

    // 清理日志（快捷操作面板中的）
    const clearLogsActionBtn = document.getElementById('clearLogsAction');
    if (clearLogsActionBtn) {
      clearLogsActionBtn.addEventListener('click', async () => {
        if (!confirm('确定要清理所有日志文件吗？此操作将清空所有日志内容。')) {
          return;
        }
        await this.executeAction('clear-logs', '清理日志');
      });
    }

    // 重新加载配置
    const reloadConfigBtn = document.getElementById('reloadConfig');
    if (reloadConfigBtn) {
      reloadConfigBtn.addEventListener('click', async () => {
        await this.executeAction('reload-config', '重新加载配置');
      });
    }

    // 导出报告
    const exportReportBtn = document.getElementById('exportReport');
    if (exportReportBtn) {
      exportReportBtn.addEventListener('click', async () => {
        const format = prompt('选择导出格式：\n1. JSON\n2. CSV', '1');
        const formatType = format === '2' ? 'csv' : 'json';
        window.location.href = `/api/actions/export-report?format=${formatType}`;
      });
    }
  }

  // 执行快捷操作
  async executeAction(action, actionName) {
    try {
      const response = await fetch(`/api/actions/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const result = await response.json();
      alert(`${actionName}成功：${result.message || '操作完成'}`);
      
      // 如果是重新加载配置，刷新数据
      if (action === 'reload-config') {
        this.loadInitialData();
      }
    } catch (error) {
      console.error(`${actionName}失败:`, error);
      alert(`${actionName}失败：${error.message}`);
    }
  }

  // 加载初始数据
  async loadInitialData() {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      const data = await response.json();
      console.log('[前端] 加载的完整数据:', data);
      console.log('[前端] 模型数据:', data.models);
      
      // 详细打印每个模型的配额信息
      if (data.models && data.models.length > 0) {
        console.log('[前端] 模型配额详情:');
        data.models.forEach(m => {
          console.log(`  ${m.provider} - ${m.name}: quotaUsed=${m.quotaUsed} (${typeof m.quotaUsed}), quotaTotal=${m.quotaTotal} (${typeof m.quotaTotal})`);
        });
      }
      
      this.data = data;
      this.updateAllPanels();
    } catch (error) {
      console.error('加载初始数据失败:', error);
      this.showError('无法连接到服务器，请确保后端服务正在运行');
      // 显示错误信息到各个面板
      this.showLoadingError();
    }
  }

  // 显示错误信息
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(239, 68, 68, 0.9);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 400px;
    `;
    errorDiv.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">⚠️ 连接错误</div>
      <div style="font-size: 0.9em;">${message}</div>
      <div style="margin-top: 12px; font-size: 0.85em; opacity: 0.9;">
        请检查：<br>
        1. 后端服务是否运行（npm start）<br>
        2. 端口是否正确（默认3000）<br>
        3. 浏览器控制台是否有错误
      </div>
    `;
    document.body.appendChild(errorDiv);
    
    // 5秒后自动移除
    setTimeout(() => {
      errorDiv.remove();
    }, 10000);
  }

  // 显示加载错误到各个面板
  showLoadingError() {
    const panels = [
      'systemOverview',
      'agentsList',
      'currentTasks',
      'channelsStatus',
      'modelsQuota',
      'taskHistory',
      'logContainer'
    ];
    
    panels.forEach(panelId => {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.innerHTML = `
          <div class="empty-state" style="color: var(--error);">
            <div style="font-size: 1.2em; margin-bottom: 8px;">❌ 无法加载数据</div>
            <div style="font-size: 0.9em;">请检查后端服务是否运行</div>
          </div>
        `;
      }
    });
  }

  // 更新所有面板
  updateAllPanels() {
    this.updateHealthPanel();
    this.updateSystemOverview();
    this.updateAgentsList();
    this.updateCurrentTasks();
    this.updateChannelsStatus();
    this.updateModelsQuota();
    this.updateTaskHistory();
    this.updateModelUsageStats();
    this.updateLogs();
    
    // 更新侧边栏布局的特定面板
    if (window.sidebarManager) {
      this.updateResourcesPanel();
      this.updateAlertsPanel();
      this.updateStatisticsPanel();
      this.updateMessagesPanel();
    }
    
    // 更新侧边栏徽章
    if (window.updateSidebarBadges) {
      window.updateSidebarBadges(this.data);
    }
    
    // 更新图表
    if (window.chartsManager) {
      window.chartsManager.updateAllCharts();
    }

    // 面板内容更新后，多次触发布局确保能测到正确高度（避免 reflow 未完成或时序问题）
    const runLayout = () => {
      if (window.uiEnhancements && window.uiEnhancements.layoutMasonry) {
        window.uiEnhancements.layoutMasonry();
      }
    };
    // 1. 强制 reflow：让浏览器先对刚写入的 DOM 做布局，再读高度
    const grid = document.querySelector('.grid');
    if (grid) {
      void grid.offsetHeight;
    }
    runLayout();
    // 2. 下一帧再排一次（布局/绘制可能延迟一帧）
    requestAnimationFrame(runLayout);
    // 3. 短延迟兜底（字体、图片等可能稍晚影响高度）
    setTimeout(runLayout, 100);
    setTimeout(runLayout, 400);
  }

  // 更新资源监控面板（侧边栏布局）
  async updateResourcesPanel() {
    const panel = document.getElementById('resourcesContent');
    if (!panel) return;

    try {
      const response = await fetch('/api/system/resources');
      if (!response.ok) return;
      
      const resources = await response.json();
      const sys = resources && resources.system;
      if (!sys || !sys.cpu || !sys.memory || !sys.disk || !sys.network) {
        panel.innerHTML = '<div class="empty-state">资源数据不可用</div>';
        return;
      }
      const html = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${(sys.cpu.usage ?? 0).toFixed(1)}%</div>
            <div class="stat-label">CPU使用率</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${(sys.memory.percent ?? 0).toFixed(1)}%</div>
            <div class="stat-label">内存使用率</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${(sys.disk.percent ?? 0).toFixed(1)}%</div>
            <div class="stat-label">磁盘使用率</div>
          </div>
        </div>
        <div style="margin-top: 20px;">
          <h3 style="margin-bottom: 10px;">详细信息</h3>
          <div class="status-item">
            <span class="status-label">CPU核心数</span>
            <span class="status-value">${sys.cpu.cores ?? '--'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">总内存</span>
            <span class="status-value">${(sys.memory.total ?? 0).toFixed(0)} MB</span>
          </div>
          <div class="status-item">
            <span class="status-label">已用内存</span>
            <span class="status-value">${(sys.memory.used ?? 0).toFixed(0)} MB</span>
          </div>
          <div class="status-item">
            <span class="status-label">总磁盘</span>
            <span class="status-value">${(sys.disk.total ?? 0).toFixed(1)} GB</span>
          </div>
          <div class="status-item">
            <span class="status-label">已用磁盘</span>
            <span class="status-value">${(sys.disk.used ?? 0).toFixed(1)} GB</span>
          </div>
          <div class="status-item">
            <span class="status-label">网络输入</span>
            <span class="status-value">${(sys.network.input ?? 0).toFixed(2)} MB</span>
          </div>
          <div class="status-item">
            <span class="status-label">网络输出</span>
            <span class="status-value">${(sys.network.output ?? 0).toFixed(2)} MB</span>
          </div>
        </div>
      `;
      panel.innerHTML = html;
    } catch (error) {
      console.error('更新资源监控失败:', error);
    }
  }

  // 更新告警面板（侧边栏布局）
  async updateAlertsPanel() {
    const panel = document.getElementById('alertsContent');
    if (!panel) return;

    try {
      const [active, history] = await Promise.all([
        fetch('/api/alerts/active').then(r => r.ok ? r.json() : []),
        fetch('/api/alerts/history?limit=20').then(r => r.ok ? r.json() : [])
      ]);

      let html = '<h3 style="margin-bottom: 15px;">活跃告警</h3>';
      if (active.length === 0) {
        html += '<div class="empty-state">暂无活跃告警</div>';
      } else {
        html += '<div class="compact-list">';
        active.forEach(alert => {
          const severityClass = alert.severity === 'critical' ? 'badge-red' : 
                               alert.severity === 'warning' ? 'badge-yellow' : 'badge-blue';
          html += `
            <div class="compact-list-item">
              <div>
                <span class="badge ${severityClass}">${alert.severity}</span>
                <strong style="margin-left: 10px;">${alert.ruleName}</strong>
              </div>
              <div style="font-size: 0.85em; color: var(--text-secondary);">
                ${new Date(alert.timestamp).toLocaleString('zh-CN')}
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      html += '<h3 style="margin-top: 30px; margin-bottom: 15px;">告警历史</h3>';
      if (history.length === 0) {
        html += '<div class="empty-state">暂无告警历史</div>';
      } else {
        html += '<div class="compact-list">';
        history.slice(0, 10).forEach(alert => {
          const severityClass = alert.severity === 'critical' ? 'badge-red' : 
                               alert.severity === 'warning' ? 'badge-yellow' : 'badge-blue';
          const resolvedBadge = alert.resolved ? '<span class="badge badge-green">已解决</span>' : '';
          html += `
            <div class="compact-list-item">
              <div>
                <span class="badge ${severityClass}">${alert.severity}</span>
                <strong style="margin-left: 10px;">${alert.ruleName}</strong>
                ${resolvedBadge}
              </div>
              <div style="font-size: 0.85em; color: var(--text-secondary);">
                ${new Date(alert.timestamp).toLocaleString('zh-CN')}
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      panel.innerHTML = html;
    } catch (error) {
      console.error('更新告警面板失败:', error);
    }
  }

  // 更新统计面板（侧边栏布局）
  async updateStatisticsPanel() {
    const panel = document.getElementById('statisticsContent');
    if (!panel) return;

    try {
      const [today, week, month] = await Promise.all([
        fetch('/api/statistics?range=today').then(r => r.ok ? r.json() : null),
        fetch('/api/statistics?range=week').then(r => r.ok ? r.json() : null),
        fetch('/api/statistics?range=month').then(r => r.ok ? r.json() : null)
      ]);

      const html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
          ${today ? `
            <div class="card compact">
              <h3 style="margin-bottom: 15px;">今日统计</h3>
              <div class="stat-card">
                <div class="stat-value">${today.agents.total}</div>
                <div class="stat-label">Agent总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${today.tasks.total}</div>
                <div class="stat-label">任务总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${today.logs.errors}</div>
                <div class="stat-label">错误日志</div>
              </div>
            </div>
          ` : ''}
          ${week ? `
            <div class="card compact">
              <h3 style="margin-bottom: 15px;">本周统计</h3>
              <div class="stat-card">
                <div class="stat-value">${week.tasks.total}</div>
                <div class="stat-label">任务总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${week.messages.total}</div>
                <div class="stat-label">消息总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${week.logs.total}</div>
                <div class="stat-label">日志总数</div>
              </div>
            </div>
          ` : ''}
          ${month ? `
            <div class="card compact">
              <h3 style="margin-bottom: 15px;">本月统计</h3>
              <div class="stat-card">
                <div class="stat-value">${month.tasks.total}</div>
                <div class="stat-label">任务总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${month.messages.total}</div>
                <div class="stat-label">消息总数</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${month.health.current}</div>
                <div class="stat-label">健康度</div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
      panel.innerHTML = html;
    } catch (error) {
      console.error('更新统计面板失败:', error);
    }
  }

  // 更新健康度面板
  updateHealthPanel() {
    if (!this.data || !this.data.health) {
      const panel = document.getElementById('healthScore');
      const scoreVal = panel && panel.querySelector('.score-value');
      if (scoreVal) scoreVal.textContent = '--';
      const statusPanel = document.getElementById('healthStatus');
      if (statusPanel) {
        statusPanel.innerHTML = '<div class="status-badge">检测中...</div>';
      }
      return;
    }

    const health = this.data.health;
    const scoreElement = document.getElementById('healthScore')?.querySelector('.score-value');
    if (!scoreElement) return;
    scoreElement.textContent = health.score;
    
    // 根据健康度设置不同的动画效果
    scoreElement.style.animation = health.score >= 80 ? 'scoreGlow 2s ease-in-out infinite' :
                                   health.score >= 50 ? 'scoreGlow 1.5s ease-in-out infinite' :
                                   'scoreGlow 1s ease-in-out infinite';
    
    const statusBadge = document.getElementById('healthStatus')?.querySelector('.status-badge');
    if (!statusBadge) return;
    statusBadge.className = 'status-badge';
    if (health.status === 'healthy') {
      statusBadge.classList.add('healthy');
      statusBadge.textContent = '健康';
    } else if (health.status === 'warning') {
      statusBadge.classList.add('warning');
      statusBadge.textContent = '警告';
    } else {
      statusBadge.classList.add('critical');
      statusBadge.textContent = '严重';
    }

    const issuesContainer = document.getElementById('healthIssues');
    if (!issuesContainer) return;
    if (health.issues && health.issues.length > 0) {
      issuesContainer.innerHTML = health.issues.map(issue => 
        `<div class="issue-item">${issue.message}</div>`
      ).join('');
    } else {
      issuesContainer.innerHTML = '';
    }
  }

  // 更新系统概览
  updateSystemOverview() {
    if (!this.data.system) return;

    const system = this.data.system;
    
    
    // 主卡片内容 - 使用更清晰的图标和布局
    const isRunning = system.gateway.status === 'running';
    
    // 解析 CPU 和内存数值
    const cpuValue = parseFloat(system.gateway.cpu) || 0;
    const memoryStr = system.gateway.memory || '0 KB';
    const memoryKB = parseFloat(memoryStr.replace(/[^\d.]/g, '')) || 0;
    const memoryMB = memoryStr.includes('KB') ? memoryKB / 1024 : memoryKB;
    const memoryPercent = Math.min(100, (memoryMB / 512) * 100); // 假设 512MB 为 100%
    
    // 根据使用率确定颜色
    const getCpuColor = (val) => val > 80 ? '#ef4444' : val > 50 ? '#f59e0b' : '#3b82f6';
    const getMemColor = (val) => val > 80 ? '#ef4444' : val > 50 ? '#f59e0b' : '#8b5cf6';
    const cpuColor = getCpuColor(cpuValue);
    const memColor = getMemColor(memoryPercent);
    
    const html = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: ${isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; padding: 14px; border-radius: 10px; text-align: center; border: 1px solid ${isRunning ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};">
          <div style="font-size: 1.8em; margin-bottom: 6px;">${isRunning ? '✅' : '❌'}</div>
          <div style="font-size: 0.75em; color: var(--text-secondary);">Gateway</div>
          <div style="font-size: 0.9em; font-weight: 600; color: ${isRunning ? '#10b981' : '#ef4444'};">${isRunning ? '运行中' : '已停止'}</div>
        </div>
        <div style="background: rgba(59, 130, 246, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(59, 130, 246, 0.2);">
          <div style="position: relative; width: 60px; height: 60px; margin: 0 auto 8px;">
            <svg width="60" height="60" style="transform: rotate(-90deg);">
              <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(59, 130, 246, 0.2)" stroke-width="6"/>
              <circle cx="30" cy="30" r="26" fill="none" stroke="${cpuColor}" stroke-width="6" 
                stroke-dasharray="${2 * Math.PI * 26}" 
                stroke-dashoffset="${2 * Math.PI * 26 * (1 - cpuValue / 100)}"
                stroke-linecap="round"
                style="transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;"/>
            </svg>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.85em; font-weight: 700; color: ${cpuColor};">
              ${cpuValue.toFixed(0)}%
            </div>
          </div>
          <div style="font-size: 0.75em; color: var(--text-secondary);">CPU 占用</div>
        </div>
        <div style="background: rgba(139, 92, 246, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(139, 92, 246, 0.2);">
          <div style="position: relative; width: 60px; height: 60px; margin: 0 auto 8px;">
            <svg width="60" height="60" style="transform: rotate(-90deg);">
              <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(139, 92, 246, 0.2)" stroke-width="6"/>
              <circle cx="30" cy="30" r="26" fill="none" stroke="${memColor}" stroke-width="6" 
                stroke-dasharray="${2 * Math.PI * 26}" 
                stroke-dashoffset="${2 * Math.PI * 26 * (1 - memoryPercent / 100)}"
                stroke-linecap="round"
                style="transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;"/>
            </svg>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.7em; font-weight: 700; color: ${memColor};">
              ${memoryMB.toFixed(0)}MB
            </div>
          </div>
          <div style="font-size: 0.75em; color: var(--text-secondary);">内存占用</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.85em;">
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">🏠</span>
          <span style="color: var(--text-secondary);">主机</span>
          <span style="margin-left: auto; font-weight: 500;">${system.hostname}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">🔢</span>
          <span style="color: var(--text-secondary);">PID</span>
          <span style="margin-left: auto; font-weight: 500;">${system.gateway.pid || 'N/A'}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">⏱️</span>
          <span style="color: var(--text-secondary);">运行时间</span>
          <span style="margin-left: auto; font-weight: 500;">${system.gateway.uptime || 'N/A'}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">🌐</span>
          <span style="color: var(--text-secondary);">端口</span>
          <span style="margin-left: auto; font-weight: 500;">${system.gateway.port || 'N/A'}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">📦</span>
          <span style="color: var(--text-secondary);">Node.js</span>
          <span style="margin-left: auto; font-weight: 500;">${system.nodeVersion}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px;">
          <span style="font-size: 1.1em;">🖥️</span>
          <span style="color: var(--text-secondary);">架构</span>
          <span style="margin-left: auto; font-weight: 500;">${system.platform} ${system.arch}</span>
        </div>
      </div>
    `;
    const sysPanel = document.getElementById('systemOverview');
    if (sysPanel) sysPanel.innerHTML = html;
  }

  // 更新右侧边栏系统摘要
  _updateSystemSummary(system) {
    const summaryGateway = document.getElementById('summaryGateway');
    const summaryCpu = document.getElementById('summaryCpu');
    const summaryMemory = document.getElementById('summaryMemory');
    const summaryUptime = document.getElementById('summaryUptime');
    
    if (summaryGateway) {
      const isRunning = system.gateway.status === 'running';
      summaryGateway.textContent = isRunning ? '运行中' : '已停止';
      summaryGateway.style.color = isRunning ? '#10b981' : '#ef4444';
    }
    if (summaryCpu) {
      summaryCpu.textContent = system.gateway.cpu || 'N/A';
    }
    if (summaryMemory) {
      summaryMemory.textContent = system.gateway.memory || 'N/A';
    }
    if (summaryUptime) {
      summaryUptime.textContent = system.gateway.uptime || 'N/A';
    }
  }

  // 更新Agent列表 - 组织架构视图
  updateAgentsList() {
    if (!this.data.agents || this.data.agents.length === 0) {
      const al = document.getElementById('agentsList');
      if (al) al.innerHTML = '<div class="empty-state">暂无Agent</div>';
      return;
    }

    // 更新Agent过滤器选项
    // agentFilter 已由 search.js 管理
    

    // 如果搜索管理器存在且有搜索关键词，让搜索管理器处理
    if (window.searchManager && window.searchManager.currentFilters.agents.keyword) {
      window.searchManager.filterAgents();
      return;
    }

    // 构建组织架构
    const agents = this.data.agents;
    const agentMap = new Map(agents.map(a => [a.id, a]));
    
    // 找出哪些 agent 是其他 agent 的子 agent
    const childAgentIds = new Set();
    agents.forEach(agent => {
      if (agent.subagents && agent.subagents.length > 0) {
        agent.subagents.forEach(subId => childAgentIds.add(subId));
      }
    });
    
    // 主 Agent（不是任何人的子 agent）
    const mainAgents = agents.filter(a => !childAgentIds.has(a.id));
    
    // 统计信息
    const activeCount = agents.filter(a => a.status === 'active').length;
    const idleCount = agents.filter(a => a.status === 'idle').length;
    const totalSessions = agents.reduce((sum, a) => sum + (a.sessionCount || 0), 0);

    // 生成组织架构 HTML
    const html = `
      <!-- 统计概览 -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1)); padding: 16px; border-radius: 12px; text-align: center;">
          <div style="font-size: 2em; font-weight: 700; color: #3b82f6;">${agents.length}</div>
          <div style="font-size: 0.85em; color: var(--text-secondary);">Agent 总数</div>
        </div>
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(52, 211, 153, 0.1)); padding: 16px; border-radius: 12px; text-align: center;">
          <div style="font-size: 2em; font-weight: 700; color: #10b981;">${activeCount}</div>
          <div style="font-size: 0.85em; color: var(--text-secondary);">活跃中</div>
        </div>
        <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 191, 36, 0.1)); padding: 16px; border-radius: 12px; text-align: center;">
          <div style="font-size: 2em; font-weight: 700; color: #f59e0b;">${idleCount}</div>
          <div style="font-size: 0.85em; color: var(--text-secondary);">空闲中</div>
        </div>
        <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(167, 139, 250, 0.1)); padding: 16px; border-radius: 12px; text-align: center;">
          <div style="font-size: 2em; font-weight: 700; color: #8b5cf6;">${totalSessions}</div>
          <div style="font-size: 0.85em; color: var(--text-secondary);">总会话数</div>
        </div>
      </div>

      <!-- 组织架构树 -->
      <div class="org-tree">
        ${mainAgents.map(agent => this._renderAgentNode(agent, agentMap, 0)).join('')}
      </div>
    `;
    
    document.getElementById('agentsList').innerHTML = html;
  }

  // 渲染单个 Agent 节点（支持递归渲染子 Agent）
  _renderAgentNode(agent, agentMap, level) {
    const hasSubagents = agent.subagents && agent.subagents.length > 0;
    const isActive = agent.status === 'active';
    
    // 状态颜色
    const statusColor = isActive ? '#10b981' : '#f59e0b';
    const statusBg = isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const statusText = isActive ? '活跃' : '空闲';

    // 主 Agent（level 0）使用完整卡片，子 Agent 使用紧凑显示
    if (level === 0) {
      // 收集子 Agent 信息用于内联显示 - 方块状横向排列
      let subagentsHtml = '';
      if (hasSubagents) {
        const subagentItems = agent.subagents.map(subId => {
          const subAgent = agentMap.get(subId);
          if (subAgent) {
            const subActive = subAgent.status === 'active';
            const subColor = subActive ? '#10b981' : '#f59e0b';
            const subBg = subActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)';
            const subBorder = subActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)';
            return `
              <div class="clickable" onclick="event.stopPropagation(); window.showAgentDetail('${subAgent.id}')" style="
                width: 120px; padding: 12px; text-align: center;
                background: ${subBg}; border-radius: 12px; cursor: pointer;
                border: 1px solid ${subBorder}; transition: all 0.2s;
              " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.12)';" 
                 onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                <div style="position: relative; display: inline-block;">
                  <div style="font-size: 2em; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; background: ${subActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; border-radius: 12px; margin: 0 auto 8px;">
                    ${subAgent.emoji}
                  </div>
                  <span style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background: ${subColor}; border-radius: 50%; border: 2px solid var(--card-bg); ${subActive ? 'animation: pulse 2s infinite;' : ''}"></span>
                </div>
                <div style="font-weight: 600; font-size: 0.85em; color: var(--text-primary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${subAgent.name}</div>
                <div style="font-size: 0.65em; padding: 1px 6px; background: rgba(99, 102, 241, 0.1); color: #6366f1; border-radius: 8px; display: inline-block; margin-bottom: 4px;">${subAgent.role || '助手'}</div>
                <div style="font-size: 0.7em; color: var(--text-muted);">${subAgent.sessionCount || 0} 会话</div>
              </div>
            `;
          } else {
            return `
              <div style="width: 120px; padding: 12px; text-align: center; background: rgba(100,100,100,0.05); border: 1px dashed var(--border); border-radius: 12px;">
                <div style="font-size: 2em; margin-bottom: 8px;">🔗</div>
                <div style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 2px;">${subId}</div>
                <div style="font-size: 0.7em; color: var(--text-muted);">未配置</div>
              </div>
            `;
          }
        }).join('');
        
        subagentsHtml = `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
            <div style="font-size: 0.8em; color: var(--text-secondary); margin-bottom: 10px; font-weight: 500;">
              <span style="margin-right: 4px;">👥</span> 子 Agent (${agent.subagents.length})
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              ${subagentItems}
            </div>
          </div>
        `;
      }

      return `
        <div class="agent-org-node" style="margin-bottom: 16px;">
          <div class="agent-card clickable" onclick="window.showAgentDetail('${agent.id}')" style="
            background: var(--card-bg);
            border: 2px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'};
            border-radius: 12px;
            padding: 16px;
            transition: all 0.2s;
            cursor: pointer;
            ${isActive ? 'box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);' : ''}
          " onmouseover="this.style.transform='translateX(4px)'; this.style.borderColor='var(--accent)';" 
             onmouseout="this.style.transform='none'; this.style.borderColor='${isActive ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}';">
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 1.8em; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; background: ${statusBg}; border-radius: 10px;">
                  ${agent.emoji}
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.05em; font-weight: 600; color: var(--text-primary);">${agent.name}</span>
                    <span style="font-size: 0.7em; padding: 2px 8px; background: rgba(99, 102, 241, 0.1); color: #6366f1; border-radius: 10px; font-weight: 500;">${agent.role || '通用助手'}</span>
                  </div>
                  <div style="font-size: 0.75em; color: var(--text-secondary); font-family: monospace;">${agent.id}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="text-align: center;">
                  <div style="font-size: 0.7em; color: var(--text-secondary);">模型</div>
                  <div style="font-size: 0.8em; font-weight: 500;">${agent.model || 'N/A'}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.7em; color: var(--text-secondary);">会话</div>
                  <div style="font-size: 0.8em; font-weight: 500;">${agent.sessionCount || 0}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 0.7em; color: var(--text-secondary);">活动</div>
                  <div style="font-size: 0.8em; font-weight: 500;">${agent.lastActivity ? this._formatRelativeTime(agent.lastActivity) : 'N/A'}</div>
                </div>
                <span style="padding: 4px 10px; background: ${statusBg}; color: ${statusColor}; border-radius: 16px; font-size: 0.75em; font-weight: 600;">
                  <span style="display: inline-block; width: 5px; height: 5px; background: ${statusColor}; border-radius: 50%; margin-right: 5px; ${isActive ? 'animation: pulse 2s infinite;' : ''}"></span>
                  ${statusText}
                </span>
              </div>
            </div>
            ${subagentsHtml}
          </div>
        </div>
      `;
    }
    
    // 子 Agent 不单独渲染（已内联在主 Agent 中）
    return '';
  }

  // 格式化相对时间
  _formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  }

  // 更新当前任务
  updateCurrentTasks() {
    // 更新任务Agent过滤器选项
    const taskAgentFilter = document.getElementById('taskAgentFilter');
    if (taskAgentFilter && this.data.agents) {
      const currentValue = taskAgentFilter.value;
      taskAgentFilter.innerHTML = '<option value="all">全部Agent</option>';
      this.data.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = agent.name;
        taskAgentFilter.appendChild(option);
      });
      taskAgentFilter.value = currentValue || 'all';
    }

    if (!this.data.tasks || !this.data.tasks.current || this.data.tasks.current.length === 0) {
      const ct = document.getElementById('currentTasks');
      if (ct) ct.innerHTML = '<div class="empty-state">暂无当前任务</div>';
      return;
    }

    // 如果搜索管理器存在且没有搜索关键词，使用原始渲染
    if (!window.searchManager || !window.searchManager.currentFilters.tasks.keyword) {
      const html = this.data.tasks.current.slice(0, 10).map(task => `
        <div class="task-item clickable" onclick="window.showTaskDetail('${task.id}')">
          <div class="task-header">
            <span><strong>${task.agentName}</strong></span>
            <span class="badge badge-blue">进行中</span>
          </div>
          <div class="task-title" style="margin: 6px 0 4px; font-size: 0.95em; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📌 ${task.title || '(无标题)'}</div>
          <div class="task-id" style="font-size: 0.8em; color: var(--text-muted);">ID: ${task.id.substring(0, 12)}...</div>
          <div class="task-time">消息数: ${task.messageCount} | 更新: ${new Date(task.lastUpdate).toLocaleString('zh-CN')}</div>
        </div>
      `).join('');
      const ctPanel = document.getElementById('currentTasks');
      if (ctPanel) ctPanel.innerHTML = html;
    } else {
      // 有搜索关键词，让搜索管理器处理
      window.searchManager.filterTasks();
    }
  }

  // 更新通道状态
  updateChannelsStatus() {
    if (!this.data.channels || this.data.channels.length === 0) {
      const cs = document.getElementById('channelsStatus');
      if (cs) cs.innerHTML = '<div class="empty-state">暂无通道</div>';
      return;
    }

    const html = this.data.channels.map(channel => {
      const statusClass = channel.status === 'normal' ? 'status-ok' : 
                         channel.status === 'warning' ? 'status-warn' : 'status-error';
      const statusText = channel.status === 'normal' ? '正常' : 
                        channel.status === 'warning' ? '警告' : '异常';
      const statusIcon = channel.status === 'normal' ? '✅' : 
                        channel.status === 'warning' ? '⚠️' : '❌';
      
      return `
        <div class="channel-item">
          <div class="channel-name">${this.getChannelIcon(channel.name)} ${channel.name}</div>
          <div class="channel-status ${statusClass}">${statusIcon} ${statusText}</div>
          ${channel.lastMessage ? `<div style="font-size: 0.8em; color: var(--text-muted); margin-top: 4px;">${channel.lastMessage}</div>` : ''}
        </div>
      `;
    }).join('');
    const csPanel = document.getElementById('channelsStatus');
    if (csPanel) csPanel.innerHTML = `<div class="channel-grid">${html}</div>`;
  }

  // 获取通道图标
  getChannelIcon(name) {
    const icons = {
      telegram: '📱',
      discord: '🎮',
      whatsapp: '💬',
      feishu: '📋'
    };
    return icons[name.toLowerCase()] || '📡';
  }

  // 更新模型配额
  updateModelsQuota() {
    if (!this.data.models || this.data.models.length === 0) {
      const mq = document.getElementById('modelsQuota');
      if (mq) mq.innerHTML = '<div class="empty-state">暂无模型信息</div>';
      return;
    }

    // 调试：打印模型数据
    console.log('[前端] 模型数据:', this.data.models);
    console.log('[前端] 模型数量:', this.data.models.length);

    // 按提供商分组模型
    const providerGroups = {};
    this.data.models.forEach(model => {
      const provider = model.provider || 'unknown';
      const quotaUsed = Number(model.quotaUsed) || 0;
      const quotaTotal = Number(model.quotaTotal) || 0;
      
      console.log(`[前端] 处理模型: ${model.name}, 提供商: ${provider}, quotaUsed=${quotaUsed} (${typeof model.quotaUsed}), quotaTotal=${quotaTotal} (${typeof model.quotaTotal})`);
      
      if (!providerGroups[provider]) {
        // 初始化时使用第一个模型的配额信息
        providerGroups[provider] = {
          provider: provider,
          models: [],
          quotaUsed: quotaUsed,
          quotaTotal: quotaTotal,
          quotaExtra: model.quotaExtra
        };
        console.log(`[前端] 初始化提供商 ${provider}: quotaUsed=${quotaUsed}, quotaTotal=${quotaTotal}`);
      } else {
        // 同一提供商的模型共享配额，使用最大的配额值（通常所有模型的值相同）
        // 优先使用非零值
        if (quotaTotal > 0 && providerGroups[provider].quotaTotal === 0) {
          providerGroups[provider].quotaTotal = quotaTotal;
          providerGroups[provider].quotaUsed = quotaUsed;
          console.log(`[前端] 更新提供商 ${provider} 配额: quotaUsed=${quotaUsed}, quotaTotal=${quotaTotal}`);
        } else if (quotaTotal > 0 && quotaTotal !== providerGroups[provider].quotaTotal) {
          // 如果配额值不同，使用较大的值
          if (quotaTotal > providerGroups[provider].quotaTotal) {
            providerGroups[provider].quotaTotal = quotaTotal;
            providerGroups[provider].quotaUsed = quotaUsed;
            console.log(`[前端] 更新提供商 ${provider} 配额（使用较大值）: quotaUsed=${quotaUsed}, quotaTotal=${quotaTotal}`);
          }
        }
      }
      providerGroups[provider].models.push(model);
    });
    
    console.log('[前端] 分组后的提供商:', Object.keys(providerGroups));
    console.log('[前端] 分组数据:', providerGroups);

    // 生成 HTML
    const html = Object.values(providerGroups).map(group => {
      // 确保转换为数字类型
      const quotaUsed = Number(group.quotaUsed) || 0;
      const quotaTotal = Number(group.quotaTotal) || 0;
      const quotaRemaining = quotaTotal > 0 ? quotaTotal - quotaUsed : 0;
      const quotaPercentage = quotaTotal > 0 ? ((quotaUsed / quotaTotal) * 100).toFixed(1) : 0;
      
      console.log(`[前端] 生成HTML - 提供商 ${group.provider}: quotaUsed=${quotaUsed}, quotaTotal=${quotaTotal}, quotaRemaining=${quotaRemaining}, quotaPercentage=${quotaPercentage}`);
      
      // 根据配额使用率设置颜色和样式
      const totalNum = Number(quotaTotal);
      const usedNum = Number(quotaUsed);
      const remaining = totalNum > 0 ? totalNum - usedNum : 0;
      const percentage = totalNum > 0 ? ((usedNum / totalNum) * 100).toFixed(1) : 0;
      
      // 判断提供商类型
      const isMiniMaxCoding = group.provider === 'minimax-coding';
      const isMoonshot = group.provider.includes('moonshot') || group.provider.includes('kimi');
      
      // 判断是余额（USD）还是调用次数
      const isBalance = isMoonshot || (totalNum < 10000 && (totalNum % 1 !== 0 || usedNum % 1 !== 0));
      const unit = isMiniMaxCoding ? ' prompts' : (isBalance ? ' USD' : ' 次');
      
      let quotaColor = '#10b981'; // 绿色 - 正常
      let quotaBgColor = 'rgba(16, 185, 129, 0.1)';
      let quotaStatus = '充足';
      let progressColor = '#10b981';
      
      if (totalNum > 0) {
        if (percentage >= 90) {
          quotaColor = '#ef4444'; // 红色 - 危险
          quotaBgColor = 'rgba(239, 68, 68, 0.1)';
          quotaStatus = '不足';
          progressColor = '#ef4444';
        } else if (percentage >= 70) {
          quotaColor = '#f59e0b'; // 黄色 - 警告
          quotaBgColor = 'rgba(245, 158, 11, 0.1)';
          quotaStatus = '较低';
          progressColor = '#f59e0b';
        }
      }
      
      console.log(`[前端] 提供商 ${group.provider} 配额检查: totalNum=${totalNum}, usedNum=${usedNum}, remaining=${remaining}`);

      // 列出该提供商下的所有模型
      const modelsList = group.models.map(m => m.name).join('、');
      const maxContextWindow = Math.max(...group.models.map(m => m.contextWindow || 0));
      
      // 生成余额显示 HTML
      let quotaHtml = '';
      
      if (isMiniMaxCoding && totalNum > 0) {
        // Minimax Coding Plan 特殊显示
        const remainsTimeMs = Number(group.quotaExtra) || 0;
        const remainsHours = Math.floor(remainsTimeMs / (1000 * 60 * 60));
        const remainsMins = Math.floor((remainsTimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const timeDisplay = remainsTimeMs > 0 ? `${remainsHours}小时 ${remainsMins}分钟` : '计算中...';
        
        // 时间进度（5小时窗口 = 18000000ms）
        const timePercentage = remainsTimeMs > 0 ? Math.min(100, (remainsTimeMs / 18000000) * 100).toFixed(1) : 0;
        
        quotaHtml = `
          <div style="margin-top: 10px; padding: 14px; background: linear-gradient(135deg, ${quotaBgColor}, rgba(99, 102, 241, 0.1)); border-radius: 10px; border-left: 4px solid ${quotaColor};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${quotaColor}" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Coding Plan
              </span>
              <span style="padding: 2px 10px; background: ${quotaColor}; color: white; border-radius: 12px; font-size: 0.75em; font-weight: 600;">${quotaStatus}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                <div style="font-size: 0.75em; color: var(--text-secondary); margin-bottom: 4px;">剩余 Prompts</div>
                <div style="font-size: 1.4em; font-weight: 700; color: ${quotaColor};">${remaining}</div>
                <div style="font-size: 0.7em; color: var(--text-secondary);">/ ${totalNum} 总量</div>
              </div>
              <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                <div style="font-size: 0.75em; color: var(--text-secondary); margin-bottom: 4px;">窗口剩余时间</div>
                <div style="font-size: 1.1em; font-weight: 600; color: #6366f1;">${timeDisplay}</div>
                <div style="font-size: 0.7em; color: var(--text-secondary);">5小时滚动窗口</div>
              </div>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-secondary); margin-bottom: 3px;">
                <span>Prompt 使用率</span>
                <span>${percentage}%</span>
              </div>
              <div style="background: rgba(0,0,0,0.15); border-radius: 4px; height: 6px; overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: ${progressColor}; border-radius: 4px; transition: width 0.3s;"></div>
              </div>
            </div>
            
            <div style="font-size: 0.7em; color: var(--text-secondary); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
              <span style="opacity: 0.8;">💡 提示：1 prompt ≈ 15 次 API 调用，额度每 5 小时动态重置</span>
            </div>
          </div>
        `;
      } else if (totalNum > 0) {
        // 通用余额显示（Moonshot 等）
        let extraInfo = '';
        if (isBalance) {
          extraInfo = `<div style="font-size: 0.7em; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">按 token 使用量计费</div>`;
        }
        
        quotaHtml = `
          <div style="margin-top: 10px; padding: 12px; background: ${quotaBgColor}; border-radius: 8px; border-left: 4px solid ${quotaColor};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 600; color: var(--text-primary);">余额状态</span>
              <span style="padding: 2px 8px; background: ${quotaColor}; color: white; border-radius: 4px; font-size: 0.75em; font-weight: 600;">${quotaStatus}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
              <span style="font-size: 1.5em; font-weight: 700; color: ${quotaColor};">${remaining.toLocaleString('zh-CN', { maximumFractionDigits: isBalance ? 2 : 0 })}${unit}</span>
              <span style="color: var(--text-secondary); font-size: 0.9em;">/ ${totalNum.toLocaleString('zh-CN', { maximumFractionDigits: isBalance ? 2 : 0 })}${unit}</span>
            </div>
            <div style="background: rgba(0,0,0,0.1); border-radius: 4px; height: 6px; overflow: hidden;">
              <div style="width: ${percentage}%; height: 100%; background: ${progressColor}; border-radius: 4px; transition: width 0.3s;"></div>
            </div>
            <div style="text-align: right; font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">已使用 ${percentage}%</div>
            ${extraInfo}
          </div>
        `;
      } else {
        // 余额未配置时不显示该提供商
        return '';
      }
      
      return `
      <div class="status-item">
        <span class="status-label">${group.provider}</span>
        <span class="badge badge-green">正常</span>
      </div>
      <div style="font-size: 0.85em; color: var(--text-secondary); margin-left: 10px; margin-bottom: 15px;">
        <div style="margin-bottom: 5px;">
          <strong>模型:</strong> ${modelsList}
        </div>
        <div style="margin-bottom: 5px;">
          最大上下文窗口: ${maxContextWindow.toLocaleString()}
        </div>
        ${quotaHtml}
      </div>
    `;
    }).join('');
    
    const mqPanel = document.getElementById('modelsQuota');
    if (mqPanel) mqPanel.innerHTML = html;
  }

  // 更新任务历史
  updateTaskHistory() {
    if (!this.data.tasks || !this.data.tasks.history || this.data.tasks.history.length === 0) {
      const th = document.getElementById('taskHistory');
      if (th) th.innerHTML = '<div class="empty-state">暂无历史任务</div>';
      return;
    }

    // 如果搜索管理器存在且没有搜索关键词，使用原始渲染
    if (!window.searchManager || !window.searchManager.currentFilters.tasks.keyword) {
      const html = this.data.tasks.history.slice(0, 10).map(task => `
        <div class="task-item clickable" onclick="window.showTaskDetail('${task.id}')">
          <div class="task-header">
            <span><strong>${task.agentName}</strong></span>
            <span class="badge badge-green">已完成</span>
          </div>
          <div class="task-title" style="margin: 6px 0 4px; font-size: 0.95em; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📌 ${task.title || '(无标题)'}</div>
          <div class="task-id" style="font-size: 0.8em; color: var(--text-muted);">ID: ${task.id.substring(0, 12)}...</div>
          <div class="task-time">消息数: ${task.messageCount} | 完成: ${new Date(task.lastUpdate).toLocaleString('zh-CN')}</div>
        </div>
      `).join('');
      const thPanel = document.getElementById('taskHistory');
      if (thPanel) thPanel.innerHTML = html;
    } else {
      // 有搜索关键词，让搜索管理器处理
      window.searchManager.filterTasks();
    }
  }

  // 更新模型使用量统计面板
  async updateModelUsageStats() {
    const container = document.getElementById('modelUsageStats');
    if (!container) return;

    // 获取时间范围选择器
    const rangeSelect = document.getElementById('modelUsageRange');
    const days = rangeSelect ? parseInt(rangeSelect.value) || 30 : 30;

    // 绑定时间范围切换事件（只绑定一次）
    if (rangeSelect && !rangeSelect._bound) {
      rangeSelect._bound = true;
      rangeSelect.addEventListener('change', () => this.updateModelUsageStats());
    }

    try {
      const response = await fetch(`/api/models/usage?days=${days}`);
      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
      const data = await response.json();

      if (!data || data.summary.totalCalls === 0) {
        container.innerHTML = '<div class="empty-state">暂无模型使用记录</div>';
        return;
      }

      const s = data.summary;

      // 颜色调色板
      const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
      ];

      // === 顶部概览条 ===
      const summaryHtml = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: rgba(59, 130, 246, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(59, 130, 246, 0.2);">
            <div style="font-size: 1.6em; font-weight: 700; color: #3b82f6;">${s.totalCalls.toLocaleString()}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">总调用次数</div>
          </div>
          <div style="background: rgba(16, 185, 129, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(16, 185, 129, 0.2);">
            <div style="font-size: 1.6em; font-weight: 700; color: #10b981;">${s.totalModels}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">活跃模型</div>
          </div>
          <div style="background: rgba(139, 92, 246, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(139, 92, 246, 0.2);">
            <div style="font-size: 1.6em; font-weight: 700; color: #8b5cf6;">${s.totalAgents}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">活跃 Agent</div>
          </div>
          <div style="background: rgba(245, 158, 11, 0.08); padding: 14px; border-radius: 10px; text-align: center; border: 1px solid rgba(245, 158, 11, 0.2);">
            <div style="font-size: 1em; font-weight: 600; color: #f59e0b; margin-top: 4px;">${s.dateRange}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">统计范围</div>
          </div>
        </div>
      `;

      // === 中间区域：按模型 + 按Agent 并排 ===
      const maxModelCount = data.byModel.length > 0 ? data.byModel[0].count : 1;
      const modelBarsHtml = data.byModel.slice(0, 8).map((m, i) => {
        const pct = (m.count / maxModelCount * 100).toFixed(0);
        const color = colors[i % colors.length];
        return `
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <div style="width: 120px; font-size: 0.82em; text-align: right; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.provider}/${m.modelName}">${m.modelName}</div>
            <div style="flex: 1; background: rgba(0,0,0,0.06); border-radius: 4px; height: 22px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.5s; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px;">
                ${pct > 15 ? `<span style="font-size: 0.75em; color: white; font-weight: 600;">${m.count}</span>` : ''}
              </div>
            </div>
            ${pct <= 15 ? `<span style="font-size: 0.8em; font-weight: 600; color: var(--text-primary); min-width: 30px;">${m.count}</span>` : '<span style="min-width: 30px;"></span>'}
          </div>
        `;
      }).join('');

      const maxAgentTotal = data.byAgent.length > 0 ? data.byAgent[0].total : 1;
      const agentBarsHtml = data.byAgent.slice(0, 8).map((a, i) => {
        const pct = (a.total / maxAgentTotal * 100).toFixed(0);
        const color = colors[(i + 3) % colors.length];
        return `
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <div style="width: 100px; font-size: 0.82em; text-align: right; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${a.agentName}">${a.agentEmoji || '🤖'} ${a.agentName}</div>
            <div style="flex: 1; background: rgba(0,0,0,0.06); border-radius: 4px; height: 22px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.5s; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px;">
                ${pct > 15 ? `<span style="font-size: 0.75em; color: white; font-weight: 600;">${a.total}</span>` : ''}
              </div>
            </div>
            ${pct <= 15 ? `<span style="font-size: 0.8em; font-weight: 600; color: var(--text-primary); min-width: 30px;">${a.total}</span>` : '<span style="min-width: 30px;"></span>'}
          </div>
        `;
      }).join('');

      const middleHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <h4 style="margin: 0 0 12px; font-size: 0.95em; color: var(--text-primary);">按模型排名</h4>
            ${modelBarsHtml || '<div class="empty-state">无数据</div>'}
          </div>
          <div>
            <h4 style="margin: 0 0 12px; font-size: 0.95em; color: var(--text-primary);">按 Agent 排名</h4>
            ${agentBarsHtml || '<div class="empty-state">无数据</div>'}
          </div>
        </div>
      `;

      // === 底部趋势图区域 ===
      const trendHtml = `
        <div>
          <h4 style="margin: 0 0 12px; font-size: 0.95em; color: var(--text-primary);">每日调用趋势</h4>
          <div style="height: 200px; position: relative;">
            <canvas id="modelUsageTrendCanvas"></canvas>
          </div>
        </div>
      `;

      container.innerHTML = summaryHtml + middleHtml + trendHtml;

      // 渲染趋势图表
      if (window.chartsManager && data.byDay.length > 0) {
        window.chartsManager.renderModelUsageTrend(data);
      }

      // 异步内容加载完毕，直接重排瀑布流
      if (window.uiEnhancements && window.uiEnhancements.layoutMasonry) {
        window.uiEnhancements.layoutMasonry();
      }

    } catch (error) {
      console.error('更新模型使用量统计失败:', error);
      container.innerHTML = '<div class="empty-state" style="color: var(--error);">加载模型使用量失败</div>';
    }
  }

  // 更新消息流面板（侧边栏布局）
  async updateMessagesPanel() {
    const panel = document.getElementById('messagesContent');
    if (!panel) return;

    try {
      const response = await fetch('/api/messages/stream?limit=50');
      if (!response.ok) return;
      
      const data = await response.json();
      if (data.messages.length === 0) {
        panel.innerHTML = '<div class="empty-state">暂无消息</div>';
        return;
      }

      const html = data.messages.map(msg => `
        <div class="message-item message-${msg.role || 'user'}">
          <div class="message-header">
            <span class="message-role">${msg.agentName || '系统'}</span>
            <span class="message-time">${new Date(msg.timestamp).toLocaleString('zh-CN')}</span>
          </div>
          <div class="message-content">${this.escapeHtml(msg.content || msg.text || '')}</div>
        </div>
      `).join('');
      
      panel.innerHTML = `<div class="messages-container">${html}</div>`;
    } catch (error) {
      console.error('更新消息流失败:', error);
    }
  }

  // 更新日志（节流，避免频繁更新）
  updateLogs() {
    if (this.logUpdateTimer) return;
    
    this.logUpdateTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/logs/recent?count=50');
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }
        const logs = await response.json();
        
        // 更新搜索管理器的日志缓存
        if (window.searchManager) {
          window.searchManager.updateLogsCache(logs);
        } else {
          // 如果没有搜索管理器，使用原始渲染方式
          const html = logs.map(log => {
            const levelClass = log.level === 'error' ? 'log-error' : 
                              log.level === 'warn' ? 'log-warn' : 'log-info';
            const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
            // 转义HTML防止XSS
            const message = this.escapeHtml(log.message);
            return `<div class="log-entry ${levelClass}">
              <span class="log-time">${time}</span>
              ${message}
            </div>`;
          }).join('');
          
          const container = document.getElementById('logContainer');
          const wasScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
          container.innerHTML = html;
          
          if (this.autoScroll && wasScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
          }
        }
      } catch (error) {
        console.error('更新日志失败:', error);
        // 不显示错误，避免干扰用户
      } finally {
        this.logUpdateTimer = null;
      }
    }, 1000); // 最多每秒更新一次日志
  }

  // 定期刷新数据（作为WebSocket的备选方案）
  startPolling() {
    if (this._pollingTimer) clearInterval(this._pollingTimer);
    this._pollingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // WebSocket未连接时，使用轮询更新数据
        this.loadInitialData();
      }
    }, 10000); // 每10秒轮询一次
  }

  // 定期更新图表（独立于数据更新）
  startChartUpdates() {
    if (this._chartTimer) clearInterval(this._chartTimer);
    this._chartTimer = setInterval(() => {
      if (window.chartsManager) {
        window.chartsManager.updateAllCharts();
      }
    }, 30000); // 每30秒更新一次图表
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 启动时钟
  startClock() {
    const updateClock = () => {
      const el = document.getElementById('updateTime');
      if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('zh-CN');
      }
    };
    updateClock();
    if (this._clockTimer) clearInterval(this._clockTimer);
    this._clockTimer = setInterval(updateClock, 1000);
  }
}

// 页面加载完成后初始化（挂到 window 供 search.js 等模块使用）
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
