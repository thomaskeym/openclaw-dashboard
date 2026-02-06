/**
 * 告警管理模块
 * 负责监控系统指标并触发告警
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ALERT_RULES_FILE = path.join(DATA_DIR, 'alert-rules.json');
const ALERTS_HISTORY_FILE = path.join(DATA_DIR, 'alerts-history.json');

class AlertManager {
  constructor() {
    this.rules = [];
    this.alertsHistory = [];
    this.activeAlerts = new Map(); // 当前活跃的告警
    this.init();
  }

  async init() {
    await this.loadRules();
    await this.loadHistory();
  }

  // 加载告警规则
  async loadRules() {
    try {
      const content = await fs.readFile(ALERT_RULES_FILE, 'utf-8');
      this.rules = JSON.parse(content);
    } catch (error) {
      // 如果文件不存在，创建默认规则
      this.rules = this.getDefaultRules();
      await this.saveRules();
    }
  }

  // 保存告警规则
  async saveRules() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(ALERT_RULES_FILE, JSON.stringify(this.rules, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存告警规则失败:', error);
    }
  }

  // 获取默认规则
  getDefaultRules() {
    return [
      {
        id: 'cpu-high',
        name: 'CPU使用率过高',
        type: 'cpu',
        threshold: 80,
        operator: '>',
        enabled: true,
        severity: 'warning'
      },
      {
        id: 'memory-high',
        name: '内存使用率过高',
        type: 'memory',
        threshold: 85,
        operator: '>',
        enabled: true,
        severity: 'warning'
      },
      {
        id: 'health-low',
        name: '系统健康度低',
        type: 'health',
        threshold: 50,
        operator: '<',
        enabled: true,
        severity: 'critical'
      },
      {
        id: 'error-rate-high',
        name: '错误率过高',
        type: 'error_rate',
        threshold: 10,
        operator: '>',
        enabled: true,
        severity: 'warning',
        timeWindow: 300 // 5分钟
      }
    ];
  }

  // 加载告警历史
  async loadHistory() {
    try {
      const content = await fs.readFile(ALERTS_HISTORY_FILE, 'utf-8');
      const data = JSON.parse(content);
      this.alertsHistory = data.alerts || [];
    } catch (error) {
      this.alertsHistory = [];
    }
  }

  // 保存告警历史
  async saveHistory() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const data = {
        alerts: this.alertsHistory.slice(-1000), // 只保留最近1000条
        lastUpdate: new Date().toISOString()
      };
      await fs.writeFile(ALERTS_HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存告警历史失败:', error);
    }
  }

  // 检查告警规则
  async checkAlerts(metrics) {
    const newAlerts = [];
    const resolvedAlerts = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const triggered = this.evaluateRule(rule, metrics);
      const alertKey = rule.id;

      if (triggered) {
        // 检查是否已经存在相同的告警
        if (!this.activeAlerts.has(alertKey)) {
          const alert = {
            id: `${alertKey}-${Date.now()}`,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: this.generateAlertMessage(rule, metrics),
            timestamp: new Date().toISOString(),
            metrics: { ...metrics },
            resolved: false
          };

          this.activeAlerts.set(alertKey, alert);
          this.alertsHistory.push(alert);
          newAlerts.push(alert);
        }
      } else {
        // 规则不再触发，检查是否有对应的活跃告警
        if (this.activeAlerts.has(alertKey)) {
          const alert = this.activeAlerts.get(alertKey);
          alert.resolved = true;
          alert.resolvedAt = new Date().toISOString();
          resolvedAlerts.push(alert);
          this.activeAlerts.delete(alertKey);
        }
      }
    }

    // 保存历史
    if (newAlerts.length > 0 || resolvedAlerts.length > 0) {
      await this.saveHistory();
    }

    return {
      new: newAlerts,
      resolved: resolvedAlerts,
      active: Array.from(this.activeAlerts.values())
    };
  }

  // 评估规则
  evaluateRule(rule, metrics) {
    let value = null;

    switch (rule.type) {
      case 'cpu':
        value = metrics.cpu || 0;
        break;
      case 'memory':
        value = metrics.memory || 0;
        break;
      case 'health':
        value = metrics.healthScore || 100;
        break;
      case 'error_rate':
        value = metrics.errorRate || 0;
        break;
      default:
        return false;
    }

    switch (rule.operator) {
      case '>':
        return value > rule.threshold;
      case '>=':
        return value >= rule.threshold;
      case '<':
        return value < rule.threshold;
      case '<=':
        return value <= rule.threshold;
      case '==':
        return value === rule.threshold;
      default:
        return false;
    }
  }

  // 生成告警消息
  generateAlertMessage(rule, metrics) {
    let value = null;
    switch (rule.type) {
      case 'cpu':
        value = metrics.cpu || 0;
        return `CPU使用率 ${value.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
      case 'memory':
        value = metrics.memory || 0;
        return `内存使用率 ${value.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
      case 'health':
        value = metrics.healthScore || 100;
        return `系统健康度 ${value} 低于阈值 ${rule.threshold}`;
      case 'error_rate':
        value = metrics.errorRate || 0;
        return `错误率 ${value} 超过阈值 ${rule.threshold}`;
      default:
        return `${rule.name} 触发`;
    }
  }

  // 获取告警规则
  getRules() {
    return this.rules;
  }

  // 设置告警规则
  async setRules(rules) {
    this.rules = rules;
    await this.saveRules();
  }

  // 获取告警历史
  getHistory(limit = 100) {
    return this.alertsHistory.slice(-limit).reverse();
  }

  // 获取活跃告警
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }
}

module.exports = AlertManager;
