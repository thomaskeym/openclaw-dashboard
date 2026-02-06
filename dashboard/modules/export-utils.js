/**
 * 数据导出工具模块
 */

let json2csvParser;
try {
  const json2csv = require('json2csv');
  json2csvParser = json2csv.Parser;
} catch (error) {
  console.warn('json2csv未安装，CSV导出功能将不可用');
  json2csvParser = null;
}

const fs = require('fs').promises;
const path = require('path');

class ExportUtils {
  // 导出JSON格式
  static exportJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  // 导出CSV格式
  static async exportCSV(data, fields) {
    if (!json2csvParser) {
      throw new Error('json2csv未安装，请运行: npm install json2csv');
    }
    try {
      const parser = new json2csvParser({ fields });
      return parser.parse(data);
    } catch (error) {
      throw new Error(`CSV导出失败: ${error.message}`);
    }
  }

  // 导出Agent数据为CSV
  static async exportAgentsCSV(agents) {
    const fields = ['id', 'name', 'emoji', 'model', 'status', 'sessionCount', 'lastActivity'];
    const data = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      model: agent.model,
      status: agent.status,
      sessionCount: agent.sessionCount,
      lastActivity: agent.lastActivity || 'N/A'
    }));
    return this.exportCSV(data, fields);
  }

  // 导出任务数据为CSV
  static async exportTasksCSV(tasks) {
    const fields = ['id', 'agentId', 'agentName', 'status', 'messageCount', 'lastUpdate'];
    const allTasks = [...(tasks.current || []), ...(tasks.history || [])];
    const data = allTasks.map(task => ({
      id: task.id,
      agentId: task.agentId,
      agentName: task.agentName,
      status: task.status,
      messageCount: task.messageCount,
      lastUpdate: task.lastUpdate
    }));
    return this.exportCSV(data, fields);
  }

  // 导出日志数据为CSV
  static async exportLogsCSV(logs) {
    const fields = ['timestamp', 'level', 'message'];
    const data = logs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message
    }));
    return this.exportCSV(data, fields);
  }

  // 生成HTML报告
  static generateHTMLReport(data) {
    const { system, agents, tasks, channels, models, logs, health, timestamp } = data;
    
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenClaw 系统报告 - ${new Date(timestamp).toLocaleString('zh-CN')}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
            margin: 20px;
            background: #f5f7fa;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #3b82f6;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 10px;
        }
        h2 {
            color: #1e293b;
            margin-top: 30px;
            border-left: 4px solid #3b82f6;
            padding-left: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        th {
            background: #f1f5f9;
            font-weight: 600;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
        }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-yellow { background: #fef3c7; color: #92400e; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .summary-item {
            padding: 15px;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }
        .summary-value {
            font-size: 2em;
            font-weight: bold;
            color: #3b82f6;
        }
        .summary-label {
            color: #64748b;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎩 OpenClaw 系统报告</h1>
        <p>生成时间: ${new Date(timestamp).toLocaleString('zh-CN')}</p>
        
        <div class="summary">
            <div class="summary-item">
                <div class="summary-value">${agents.length}</div>
                <div class="summary-label">Agent总数</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${tasks.current.length}</div>
                <div class="summary-label">当前任务</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${tasks.history.length}</div>
                <div class="summary-label">历史任务</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${health.score}</div>
                <div class="summary-label">健康度</div>
            </div>
        </div>

        <h2>系统概览</h2>
        <table>
            <tr>
                <th>项目</th>
                <th>值</th>
            </tr>
            <tr>
                <td>主机名</td>
                <td>${system.hostname}</td>
            </tr>
            <tr>
                <td>Gateway状态</td>
                <td><span class="badge ${system.gateway.status === 'running' ? 'badge-green' : 'badge-red'}">${system.gateway.status === 'running' ? '运行中' : '已停止'}</span></td>
            </tr>
            <tr>
                <td>CPU占用</td>
                <td>${system.gateway.cpu}</td>
            </tr>
            <tr>
                <td>内存占用</td>
                <td>${system.gateway.memory}</td>
            </tr>
        </table>

        <h2>Agent列表</h2>
        <table>
            <tr>
                <th>ID</th>
                <th>名称</th>
                <th>模型</th>
                <th>状态</th>
                <th>会话数</th>
            </tr>
            ${agents.map(agent => `
            <tr>
                <td>${agent.id}</td>
                <td>${agent.emoji} ${agent.name}</td>
                <td>${agent.model}</td>
                <td><span class="badge ${agent.status === 'active' ? 'badge-green' : 'badge-yellow'}">${agent.status === 'active' ? '活跃' : '空闲'}</span></td>
                <td>${agent.sessionCount}</td>
            </tr>
            `).join('')}
        </table>

        <h2>通道状态</h2>
        <table>
            <tr>
                <th>通道名</th>
                <th>状态</th>
                <th>消息数</th>
            </tr>
            ${channels.map(channel => `
            <tr>
                <td>${channel.name}</td>
                <td><span class="badge ${channel.status === 'normal' ? 'badge-green' : channel.status === 'warning' ? 'badge-yellow' : 'badge-red'}">${channel.status}</span></td>
                <td>${channel.messageCount || 0}</td>
            </tr>
            `).join('')}
        </table>

        <h2>健康度</h2>
        <p>得分: <strong>${health.score}</strong></p>
        <p>状态: <span class="badge ${health.status === 'healthy' ? 'badge-green' : health.status === 'warning' ? 'badge-yellow' : 'badge-red'}">${health.status === 'healthy' ? '健康' : health.status === 'warning' ? '警告' : '严重'}</span></p>
        ${health.issues && health.issues.length > 0 ? `
        <h3>问题列表</h3>
        <ul>
            ${health.issues.map(issue => `<li>${issue.message}</li>`).join('')}
        </ul>
        ` : ''}
    </div>
</body>
</html>
    `;
  }
}

module.exports = ExportUtils;
