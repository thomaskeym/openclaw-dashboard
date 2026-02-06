/**
 * 通知中心模块
 */

class NotificationCenter {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.init();
  }

  init() {
    this.loadNotifications();
    this.setupUI();
    this.setupEventListeners();
    this.requestPermission();
  }

  // 请求通知权限
  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  // 设置UI
  setupUI() {
    const header = document.querySelector('.header-right');
    if (!header) return;

    const notificationBtn = document.createElement('div');
    notificationBtn.className = 'notification-btn';
    notificationBtn.id = 'notificationBtn';
    notificationBtn.innerHTML = `
      <span class="notification-icon">🔔</span>
      <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
    `;

    const notificationPanel = document.createElement('div');
    notificationPanel.className = 'notification-panel';
    notificationPanel.id = 'notificationPanel';
    notificationPanel.style.display = 'none';
    notificationPanel.innerHTML = `
      <div class="notification-header">
        <h3>通知中心</h3>
        <button class="notification-close" id="closeNotificationPanel">&times;</button>
      </div>
      <div class="notification-list" id="notificationList">
        <div class="empty-state">暂无通知</div>
      </div>
      <div class="notification-footer">
        <button class="btn-small" id="markAllRead">全部标记为已读</button>
        <button class="btn-small" id="clearNotifications">清空</button>
      </div>
    `;

    header.insertBefore(notificationBtn, header.firstChild);
    document.body.appendChild(notificationPanel);

    // 更新未读数量
    this.updateBadge();
  }

  // 设置事件监听器
  setupEventListeners() {
    const btn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel');
    const closeBtn = document.getElementById('closeNotificationPanel');
    const markAllReadBtn = document.getElementById('markAllRead');
    const clearBtn = document.getElementById('clearNotifications');

    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
          this.markAllAsRead();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', () => {
        this.markAllAsRead();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearAll();
      });
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = 'none';
      }
    });
  }

  // 添加通知
  addNotification(notification) {
    const notif = {
      id: Date.now(),
      title: notification.title || '通知',
      message: notification.message || '',
      type: notification.type || 'info', // info, success, warning, error
      timestamp: new Date().toISOString(),
      read: false,
      ...notification
    };

    this.notifications.unshift(notif);
    this.unreadCount++;
    this.updateBadge();
    this.renderNotifications();
    this.saveNotifications();

    // 显示浏览器通知
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notif.title, {
        body: notif.message,
        icon: '/static/favicon.ico',
        tag: notif.id
      });
    }
  }

  // 标记为已读
  markAsRead(id) {
    const notif = this.notifications.find(n => n.id === id);
    if (notif && !notif.read) {
      notif.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.updateBadge();
      this.renderNotifications();
      this.saveNotifications();
    }
  }

  // 标记全部为已读
  markAllAsRead() {
    this.notifications.forEach(n => {
      if (!n.read) {
        n.read = true;
      }
    });
    this.unreadCount = 0;
    this.updateBadge();
    this.renderNotifications();
    this.saveNotifications();
  }

  // 清除所有通知
  clearAll() {
    this.notifications = [];
    this.unreadCount = 0;
    this.updateBadge();
    this.renderNotifications();
    this.saveNotifications();
  }

  // 更新徽章
  updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // 渲染通知列表
  renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无通知</div>';
      return;
    }

    const html = this.notifications.slice(0, 50).map(notif => {
      const typeClass = `notification-${notif.type}`;
      const readClass = notif.read ? 'read' : '';
      const time = new Date(notif.timestamp).toLocaleString('zh-CN');

      return `
        <div class="notification-item ${typeClass} ${readClass}" data-id="${notif.id}">
          <div class="notification-item-header">
            <span class="notification-item-title">${this.escapeHtml(notif.title)}</span>
            <span class="notification-item-time">${time}</span>
          </div>
          <div class="notification-item-message">${this.escapeHtml(notif.message)}</div>
        </div>
      `;
    }).join('');

    list.innerHTML = html;

    // 添加点击事件
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        this.markAsRead(id);
      });
    });
  }

  // 加载通知
  loadNotifications() {
    try {
      const saved = localStorage.getItem('notifications');
      if (saved) {
        this.notifications = JSON.parse(saved);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.updateBadge();
        this.renderNotifications();
      }
    } catch (error) {
      console.error('加载通知失败:', error);
    }
  }

  // 保存通知
  saveNotifications() {
    try {
      localStorage.setItem('notifications', JSON.stringify(this.notifications.slice(0, 100)));
    } catch (error) {
      console.error('保存通知失败:', error);
    }
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 创建全局通知中心实例
window.notificationCenter = new NotificationCenter();
