const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const DataCollector = require('./data-collector');
const AlertManager = require('./modules/alert-manager');
const ExportUtils = require('./modules/export-utils');
const Benchmark = require('./modules/benchmark');
const LogAnalyzer = require('./modules/log-analyzer');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const fsPromises = require('fs').promises;
const osUtils = require('node-os-utils');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const collector = new DataCollector();
const alertManager = new AlertManager();
const benchmark = new Benchmark();
const logAnalyzer = new LogAnalyzer();

// 确保路径正确 - 使用绝对路径
const staticDir = path.resolve(__dirname, 'static');
console.log('静态文件目录:', staticDir);
console.log('__dirname:', __dirname);
console.log('静态目录存在:', fs.existsSync(staticDir));
console.log('CSS文件存在:', fs.existsSync(path.join(staticDir, 'css', 'style.css')));

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - 必须在所有API路由之前
// 调试：记录静态文件请求（必须在静态文件服务之前）
app.use('/static', (req, res, next) => {
  // Express的express.static会自动去掉URL前缀/static
  // 所以请求/static/css/style.css时，req.path会是/css/style.css
  // 但我们需要检查的是staticDir + req.path
  const relativePath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
  const filePath = path.join(staticDir, relativePath);
  console.log(`[静态文件请求] ${req.method} ${req.url}`);
  console.log(`  req.path: ${req.path}`);
  console.log(`  relativePath: ${relativePath}`);
  console.log(`  映射到文件: ${filePath}`);
  console.log(`  文件存在: ${fs.existsSync(filePath)}`);
  next();
});

// Express静态文件中间件
// 注意：express.static会自动去掉URL前缀，所以/static/css/style.css会映射到staticDir/css/style.css
app.use('/static', express.static(staticDir));

// WebSocket客户端管理
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket客户端已连接，当前连接数:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket客户端已断开，当前连接数:', clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

// 广播数据到所有WebSocket客户端
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 定期推送更新数据
let updateInterval;
function startPeriodicUpdates() {
  updateInterval = setInterval(async () => {
    try {
      // 并行获取所有数据以提高性能
      const [system, agents, tasks, channels, health] = await Promise.all([
        collector.getSystemOverview(),
        collector.getAgentsList(),
        collector.getTasks(),
        collector.getChannelsStatus(),
        collector.getHealthStatus()
      ]);

      // 检查告警
      const gatewayInfo = await collector.getProcessInfo('openclaw-gateway');
      const cpu = gatewayInfo ? parseFloat(gatewayInfo.cpu.replace('%', '')) : 0;
      const memoryKB = gatewayInfo ? parseInt(gatewayInfo.memory.replace(' KB', '')) : 0;
      const memoryMB = memoryKB / 1024;
      
      // 获取系统内存信息
      let memoryPercent = 0;
      try {
        const memInfo = await osUtils.mem.info();
        memoryPercent = 100 - (memInfo.freeMemPercentage || 0);
      } catch (memError) {
        // 如果获取内存信息失败，使用进程内存作为备选
        memoryPercent = memoryMB > 0 ? (memoryMB / 1024) * 10 : 0;
      }

      // 获取错误率（从最近日志中）
      const recentLogs = await collector.getRecentLogs(100);
      const errorCount = recentLogs.filter(log => log.level === 'error').length;
      const errorRate = recentLogs.length > 0 ? (errorCount / recentLogs.length) * 100 : 0;

      const metrics = {
        cpu,
        memory: memoryPercent,
        healthScore: health.score,
        errorRate
      };

      const alertResult = await alertManager.checkAlerts(metrics);

      // 如果有新告警，通过WebSocket推送
      if (alertResult.new.length > 0) {
        broadcast({
          type: 'alert',
          timestamp: new Date().toISOString(),
          data: {
            alerts: alertResult.new,
            active: alertResult.active
          }
        });
      }

      const data = {
        type: 'update',
        timestamp: new Date().toISOString(),
        data: { system, agents, tasks, channels, health, alerts: alertResult.active }
      };
      broadcast(data);
    } catch (error) {
      console.error('推送更新数据失败:', error);
    }
  }, 5000); // 每5秒更新一次
}

// 定期记录历史数据
let historyRecordInterval;
function startHistoryRecording() {
  historyRecordInterval = setInterval(async () => {
    try {
      // 并行记录所有历史数据
      await Promise.all([
        collector.recordMetricsHistory(),
        collector.recordChannelStats(),
        collector.recordTaskStats(),
        collector.recordModelUsage(),
        collector.recordHealthHistory()
      ]);
    } catch (error) {
      console.error('记录历史数据失败:', error);
    }
  }, 5000); // 每5秒记录一次
}

// 监控配置文件变化
const configWatcher = chokidar.watch(path.join(require('os').homedir(), '.openclaw', 'openclaw.json'));
configWatcher.on('change', () => {
  console.log('配置文件已更改，清除缓存');
  collector.clearCache();
  // 立即推送更新
  setTimeout(async () => {
    try {
      const data = {
        type: 'config-changed',
        timestamp: new Date().toISOString(),
        data: {
          system: await collector.getSystemOverview(),
          agents: await collector.getAgentsList(),
          channels: await collector.getChannelsStatus()
        }
      };
      broadcast(data);
    } catch (error) {
      console.error('推送配置更新失败:', error);
    }
  }, 500);
});

// API路由

// 系统概览
app.get('/api/system/overview', async (req, res) => {
  try {
    const data = await collector.getSystemOverview();
    res.json(data);
  } catch (error) {
    console.error('获取系统概览失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent列表
app.get('/api/agents/list', async (req, res) => {
  try {
    const data = await collector.getAgentsList();
    res.json(data);
  } catch (error) {
    console.error('获取Agent列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent状态
app.get('/api/agents/:id/status', async (req, res) => {
  try {
    const agentId = req.params.id;
    const os = require('os');
    const path = require('path');
    const agentDir = path.join(os.homedir(), '.openclaw', 'agents', agentId);
    const status = await collector.getAgentStatus(agentId, agentDir);
    res.json({ id: agentId, ...status });
  } catch (error) {
    console.error('获取Agent状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 当前任务
app.get('/api/tasks/current', async (req, res) => {
  try {
    const tasks = await collector.getTasks();
    res.json(tasks.current);
  } catch (error) {
    console.error('获取当前任务失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 任务历史
app.get('/api/tasks/history', async (req, res) => {
  try {
    const tasks = await collector.getTasks();
    res.json(tasks.history);
  } catch (error) {
    console.error('获取任务历史失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 通道状态
app.get('/api/channels/status', async (req, res) => {
  try {
    const data = await collector.getChannelsStatus();
    res.json(data);
  } catch (error) {
    console.error('获取通道状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 模型配额
app.get('/api/models/quota', async (req, res) => {
  try {
    console.log('[API] /api/models/quota 被调用');
    const data = await collector.getModelsQuota();
    console.log('[API] /api/models/quota 返回数据:', JSON.stringify(data.map(m => ({
      provider: m.provider,
      name: m.name,
      quotaUsed: m.quotaUsed,
      quotaTotal: m.quotaTotal
    })), null, 2));
    res.json(data);
  } catch (error) {
    console.error('获取模型配额失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 最近日志
app.get('/api/logs/recent', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const data = await collector.getRecentLogs(count);
    res.json(data);
  } catch (error) {
    console.error('获取最近日志失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 系统健康度
app.get('/api/health', async (req, res) => {
  try {
    const data = await collector.getHealthStatus();
    res.json(data);
  } catch (error) {
    console.error('获取系统健康度失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 历史数据API端点 ==========

// 性能指标历史
app.get('/api/metrics/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const data = await collector.getMetricsHistory(hours);
    res.json(data);
  } catch (error) {
    console.error('获取性能指标历史失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 消息统计
app.get('/api/channels/stats', async (req, res) => {
  try {
    const range = req.query.range || 'today'; // today/week/month
    const data = await collector.getChannelsStats(range);
    res.json(data);
  } catch (error) {
    console.error('获取消息统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 任务执行时间分布
app.get('/api/tasks/stats', async (req, res) => {
  try {
    const data = await collector.getTasksStats();
    res.json(data);
  } catch (error) {
    console.error('获取任务统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 模型使用统计
app.get('/api/models/stats', async (req, res) => {
  try {
    const data = await collector.getModelsStats();
    res.json(data);
  } catch (error) {
    console.error('获取模型使用统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 模型使用量统计（四维度：按模型、按Agent、按天、总计）
app.get('/api/models/usage', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await collector.getModelUsageStats(days);
    res.json(data);
  } catch (error) {
    console.error('获取模型使用量统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 健康度历史
app.get('/api/health/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const data = await collector.getHealthHistory(hours);
    res.json(data);
  } catch (error) {
    console.error('获取健康度历史失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 阶段3：快捷操作和详情页面 API ==========

// Agent详情
app.get('/api/agents/:id/details', async (req, res) => {
  try {
    const agentId = req.params.id;
    const details = await collector.getAgentDetails(agentId);
    res.json(details);
  } catch (error) {
    console.error('获取Agent详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 会话详情
app.get('/api/agents/:agentId/sessions/:sessionId', async (req, res) => {
  try {
    const { agentId, sessionId } = req.params;
    const details = await collector.getSessionDetails(agentId, sessionId);
    res.json(details);
  } catch (error) {
    console.error('获取会话详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 任务详情
app.get('/api/tasks/:id/details', async (req, res) => {
  try {
    const taskId = req.params.id;
    const details = await collector.getTaskDetails(taskId);
    res.json(details);
  } catch (error) {
    console.error('获取任务详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 快捷操作：重启Gateway
app.post('/api/actions/restart-gateway', async (req, res) => {
  try {
    // 查找Gateway进程
    const { stdout } = await execAsync('ps aux | grep "openclaw-gateway" | grep -v grep');
    if (!stdout.trim()) {
      return res.status(404).json({ error: 'Gateway进程未运行' });
    }

    // 获取PID
    const pid = stdout.trim().split(/\s+/)[1];
    
    // 重启Gateway（先kill再启动）
    await execAsync(`kill ${pid}`);
    
    // 等待进程完全关闭
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 启动Gateway（假设有启动脚本）
    const os = require('os');
    const gatewayScript = path.join(os.homedir(), '.openclaw', 'scripts', 'start-gateway.sh');
    try {
      await execAsync(`bash ${gatewayScript}`, { detached: true });
    } catch (e) {
      // 如果脚本不存在，尝试直接启动
      console.log('未找到启动脚本，请手动启动Gateway');
    }

    res.json({ 
      success: true, 
      message: 'Gateway重启命令已执行',
      pid: pid 
    });
  } catch (error) {
    console.error('重启Gateway失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 快捷操作：清理日志
app.post('/api/actions/clear-logs', async (req, res) => {
  try {
    const os = require('os');
    const logsDir = path.join(os.homedir(), '.openclaw', 'logs');
    
    // 读取日志目录
    const files = await fsPromises.readdir(logsDir).catch(() => []);
    
    // 清理所有日志文件（可选：只清理旧日志）
    let clearedCount = 0;
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        // 清空文件而不是删除
        await fsPromises.writeFile(filePath, '').catch(() => {});
        clearedCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `已清理 ${clearedCount} 个日志文件` 
    });
  } catch (error) {
    console.error('清理日志失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 快捷操作：重新加载配置
app.post('/api/actions/reload-config', async (req, res) => {
  try {
    collector.clearCache();
    // 触发配置重新加载
    const config = await collector.getConfig();
    
    res.json({ 
      success: true, 
      message: '配置已重新加载',
      configLoaded: config !== null
    });
  } catch (error) {
    console.error('重新加载配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 阶段4：实时监控和告警系统 API ==========

// 获取系统资源详情
app.get('/api/system/resources', async (req, res) => {
  try {
    const cpu = osUtils.cpu;
    const mem = osUtils.mem;
    const drive = osUtils.drive;
    const netstat = osUtils.netstat;

    const [cpuUsage, memInfo, driveInfo, netInfo] = await Promise.all([
      cpu.usage().catch(() => 0),
      mem.info().catch(() => ({ totalMemMb: 0, usedMemMb: 0, freeMemMb: 0 })),
      drive.info().catch(() => ({ totalGb: 0, usedGb: 0, freeGb: 0 })),
      netstat.inOut().catch(() => ({ total: { inputMb: 0, outputMb: 0 } }))
    ]);

    const gatewayInfo = await collector.getProcessInfo('openclaw-gateway');
    const gatewayCpu = gatewayInfo ? parseFloat(gatewayInfo.cpu.replace('%', '')) : 0;
    const gatewayMemoryKB = gatewayInfo ? parseInt(gatewayInfo.memory.replace(' KB', '')) : 0;
    const gatewayMemoryMB = gatewayMemoryKB / 1024;

    const result = {
      timestamp: new Date().toISOString(),
      system: {
        cpu: {
          usage: cpuUsage,
          cores: osUtils.cpu.count()
        },
        memory: {
          total: memInfo.totalMemMb,
          used: memInfo.usedMemMb,
          free: memInfo.freeMemMb,
          percent: memInfo.totalMemMb > 0 
            ? (memInfo.usedMemMb / memInfo.totalMemMb) * 100 
            : 0
        },
        disk: {
          total: driveInfo.totalGb,
          used: driveInfo.usedGb,
          free: driveInfo.freeGb,
          percent: driveInfo.totalGb > 0 
            ? (driveInfo.usedGb / driveInfo.totalGb) * 100 
            : 0
        },
        network: {
          input: netInfo.total.inputMb,
          output: netInfo.total.outputMb
        }
      },
      gateway: {
        cpu: gatewayCpu,
        memory: gatewayMemoryMB
      }
    };

    res.json(result);
  } catch (error) {
    console.error('获取系统资源详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取告警规则
app.get('/api/alerts/rules', async (req, res) => {
  try {
    const rules = alertManager.getRules();
    res.json(rules);
  } catch (error) {
    console.error('获取告警规则失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 设置告警规则
app.post('/api/alerts/rules', async (req, res) => {
  try {
    const rules = req.body;
    await alertManager.setRules(rules);
    res.json({ success: true, message: '告警规则已更新' });
  } catch (error) {
    console.error('设置告警规则失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取告警历史
app.get('/api/alerts/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = alertManager.getHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('获取告警历史失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取活跃告警
app.get('/api/alerts/active', async (req, res) => {
  try {
    const active = alertManager.getActiveAlerts();
    res.json(active);
  } catch (error) {
    console.error('获取活跃告警失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 模型配额详细监控
app.get('/api/models/quota/detailed', async (req, res) => {
  try {
    const models = await collector.getModelsQuota();
    const stats = await collector.getModelsStats();
    
    // 这里可以添加实际的API余额查询逻辑
    // 例如调用Minimax、Moonshot等API查询余额
    
    const result = {
      models: models.map(model => ({
        ...model,
        usage: stats.details.find(d => d.name === model.name) || { count: 0, percentage: 0 }
      })),
      summary: {
        totalModels: models.length,
        totalUsage: stats.details.reduce((sum, d) => sum + d.count, 0)
      }
    };

    res.json(result);
  } catch (error) {
    console.error('获取模型配额详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 阶段5：数据导出和历史对比 API ==========

// 导出JSON格式
app.get('/api/export/json', async (req, res) => {
  try {
    const [system, agents, tasks, channels, models, logs, health] = await Promise.all([
      collector.getSystemOverview(),
      collector.getAgentsList(),
      collector.getTasks(),
      collector.getChannelsStatus(),
      collector.getModelsQuota(),
      collector.getRecentLogs(1000),
      collector.getHealthStatus()
    ]);

    const data = {
      timestamp: new Date().toISOString(),
      system,
      agents,
      tasks,
      channels,
      models,
      logs,
      health
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="openclaw-export-${Date.now()}.json"`);
    res.send(ExportUtils.exportJSON(data));
  } catch (error) {
    console.error('导出JSON失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 导出CSV格式
app.get('/api/export/csv', async (req, res) => {
  try {
    const type = req.query.type || 'all'; // all, agents, tasks, logs
    
    if (type === 'agents') {
      const agents = await collector.getAgentsList();
      const csv = await ExportUtils.exportAgentsCSV(agents);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="agents-${Date.now()}.csv"`);
      res.send(csv);
    } else if (type === 'tasks') {
      const tasks = await collector.getTasks();
      const csv = await ExportUtils.exportTasksCSV(tasks);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tasks-${Date.now()}.csv"`);
      res.send(csv);
    } else if (type === 'logs') {
      const logs = await collector.getRecentLogs(1000);
      const csv = await ExportUtils.exportLogsCSV(logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      // 导出所有数据
      const [agents, tasks, logs] = await Promise.all([
        collector.getAgentsList(),
        collector.getTasks(),
        collector.getRecentLogs(1000)
      ]);
      
      // 合并所有CSV数据
      const agentsCSV = await ExportUtils.exportAgentsCSV(agents);
      const tasksCSV = await ExportUtils.exportTasksCSV(tasks);
      const logsCSV = await ExportUtils.exportLogsCSV(logs);
      
      const combinedCSV = `=== Agents ===\n${agentsCSV}\n\n=== Tasks ===\n${tasksCSV}\n\n=== Logs ===\n${logsCSV}`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="openclaw-all-${Date.now()}.csv"`);
      res.send(combinedCSV);
    }
  } catch (error) {
    console.error('导出CSV失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生成HTML报告
app.get('/api/export/report', async (req, res) => {
  try {
    const [system, agents, tasks, channels, models, logs, health] = await Promise.all([
      collector.getSystemOverview(),
      collector.getAgentsList(),
      collector.getTasks(),
      collector.getChannelsStatus(),
      collector.getModelsQuota(),
      collector.getRecentLogs(100),
      collector.getHealthStatus()
    ]);

    const data = {
      timestamp: new Date().toISOString(),
      system,
      agents,
      tasks,
      channels,
      models,
      logs: logs.slice(0, 100),
      health
    };

    const html = ExportUtils.generateHTMLReport(data);
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="openclaw-report-${Date.now()}.html"`);
    res.send(html);
  } catch (error) {
    console.error('生成HTML报告失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 历史数据对比
app.get('/api/compare', async (req, res) => {
  try {
    const start = req.query.start ? new Date(req.query.start) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = req.query.end ? new Date(req.query.end) : new Date();
    
    // 获取两个时间点的数据
    const [metricsHistory, healthHistory] = await Promise.all([
      collector.getMetricsHistory(24),
      collector.getHealthHistory(24)
    ]);

    // 过滤指定时间范围的数据
    const startTime = start.getTime();
    const endTime = end.getTime();
    
    const filteredMetrics = {
      labels: [],
      cpu: [],
      memory: []
    };
    
    const filteredHealth = {
      labels: [],
      scores: [],
      statuses: []
    };

    // 这里简化处理，实际应该从历史数据文件中读取
    // 由于历史数据是按时间戳存储的，需要解析时间戳进行过滤
    
    res.json({
      start: start.toISOString(),
      end: end.toISOString(),
      metrics: filteredMetrics,
      health: filteredHealth,
      comparison: {
        avgCpu: 0,
        avgMemory: 0,
        avgHealth: 0
      }
    });
  } catch (error) {
    console.error('获取历史对比失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 统计数据
app.get('/api/statistics', async (req, res) => {
  try {
    const range = req.query.range || 'today'; // today, week, month
    
    const [agents, tasks, channels, logs, health] = await Promise.all([
      collector.getAgentsList(),
      collector.getTasks(),
      collector.getChannelsStatus(),
      collector.getRecentLogs(1000),
      collector.getHealthStatus()
    ]);

    const now = new Date();
    let startTime;
    
    if (range === 'today') {
      startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === 'week') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 过滤时间范围内的数据
    const filteredTasks = {
      current: tasks.current.filter(t => new Date(t.lastUpdate) >= startTime),
      history: tasks.history.filter(t => new Date(t.lastUpdate) >= startTime)
    };

    const filteredLogs = logs.filter(log => new Date(log.timestamp) >= startTime);
    const errorLogs = filteredLogs.filter(log => log.level === 'error');
    const warnLogs = filteredLogs.filter(log => log.level === 'warn');

    const stats = {
      range,
      period: {
        start: startTime.toISOString(),
        end: now.toISOString()
      },
      agents: {
        total: agents.length,
        active: agents.filter(a => a.status === 'active').length,
        idle: agents.filter(a => a.status === 'idle').length
      },
      tasks: {
        current: filteredTasks.current.length,
        completed: filteredTasks.history.length,
        total: filteredTasks.current.length + filteredTasks.history.length
      },
      messages: {
        total: channels.reduce((sum, c) => sum + (c.messageCount || 0), 0)
      },
      logs: {
        total: filteredLogs.length,
        errors: errorLogs.length,
        warnings: warnLogs.length,
        info: filteredLogs.length - errorLogs.length - warnLogs.length
      },
      health: {
        current: health.score,
        status: health.status
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 阶段6：消息流监控和性能基准测试 API ==========

// 获取消息流
app.get('/api/messages/stream', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const agentId = req.query.agentId;
    const taskId = req.query.taskId;
    
    const agents = await collector.getAgentsList();
    const messages = [];

    // 如果指定了taskId，只返回该任务的消息
    if (taskId) {
      const taskDetails = await collector.getTaskDetails(taskId);
      return res.json({
        messages: taskDetails.messages || [],
        total: taskDetails.messageCount || 0
      });
    }

    // 如果指定了agentId，只返回该Agent的消息
    const targetAgents = agentId 
      ? agents.filter(a => a.id === agentId)
      : agents;

    for (const agent of targetAgents.slice(0, 10)) {
      const agentDir = path.join(require('os').homedir(), '.openclaw', 'agents', agent.id, 'sessions');
      try {
        const files = await fsPromises.readdir(agentDir).catch(() => []);
        const sessionFiles = files.filter(f => 
          f.endsWith('.jsonl') && !f.includes('.deleted.')
        ).slice(0, 5); // 每个Agent最多5个会话

        for (const file of sessionFiles) {
          const filePath = path.join(agentDir, file);
          const content = await fsPromises.readFile(filePath, 'utf-8').catch(() => '');
          const lines = content.trim().split('\n').filter(l => l);

          for (const line of lines) {
            try {
              const message = JSON.parse(line);
              messages.push({
                ...message,
                agentId: agent.id,
                agentName: agent.name,
                taskId: file.replace('.jsonl', ''),
                timestamp: message.timestamp || new Date().toISOString()
              });
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      } catch (error) {
        // 忽略Agent错误
      }
    }

    // 按时间排序
    messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    res.json({
      messages: messages.slice(-limit),
      total: messages.length,
      limit
    });
  } catch (error) {
    console.error('获取消息流失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 开始性能基准测试
app.post('/api/benchmark/start', async (req, res) => {
  try {
    if (benchmark.isRunning) {
      return res.status(400).json({ error: '基准测试已在运行中' });
    }

    // 异步执行测试
    benchmark.start().catch(error => {
      console.error('基准测试执行失败:', error);
    });

    res.json({ 
      success: true, 
      message: '基准测试已开始',
      status: benchmark.getStatus()
    });
  } catch (error) {
    console.error('启动基准测试失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取基准测试状态
app.get('/api/benchmark/status', async (req, res) => {
  try {
    const status = benchmark.getStatus();
    res.json(status);
  } catch (error) {
    console.error('获取基准测试状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取基准测试结果
app.get('/api/benchmark/results', async (req, res) => {
  try {
    const results = benchmark.getResults();
    if (!results) {
      return res.status(404).json({ error: '暂无测试结果' });
    }
    res.json(results);
  } catch (error) {
    console.error('获取基准测试结果失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== 阶段7：实用工具 API ==========

// 获取配置
app.get('/api/config', async (req, res) => {
  try {
    const config = await collector.getConfig();
    if (!config) {
      return res.status(404).json({ error: '配置文件不存在' });
    }
    res.json(config);
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新配置
app.put('/api/config', async (req, res) => {
  try {
    const config = req.body;
    const CONFIG_FILE = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    
    // 验证配置格式
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: '无效的配置格式' });
    }

    // 备份原配置
    const backupFile = `${CONFIG_FILE}.backup.${Date.now()}`;
    try {
      const currentConfig = await fsPromises.readFile(CONFIG_FILE, 'utf-8');
      await fsPromises.writeFile(backupFile, currentConfig, 'utf-8');
    } catch (e) {
      // 备份失败不影响更新
    }

    // 写入新配置
    await fsPromises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    
    // 清除缓存
    collector.clearCache();

    res.json({ 
      success: true, 
      message: '配置已更新',
      backup: backupFile
    });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 验证配置
app.post('/api/config/validate', async (req, res) => {
  try {
    const config = req.body;
    const errors = [];

    // 基本验证
    if (!config) {
      errors.push('配置为空');
    } else {
      if (!config.gateway) errors.push('缺少gateway配置');
      if (!config.agents) errors.push('缺少agents配置');
      if (!config.channels) errors.push('缺少channels配置');
    }

    res.json({
      valid: errors.length === 0,
      errors
    });
  } catch (error) {
    console.error('验证配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 备份配置
app.get('/api/config/backup', async (req, res) => {
  try {
    const CONFIG_FILE = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    const backupFile = `${CONFIG_FILE}.backup.${Date.now()}`;
    
    const config = await fsPromises.readFile(CONFIG_FILE, 'utf-8');
    await fsPromises.writeFile(backupFile, config, 'utf-8');

    res.json({
      success: true,
      message: '配置已备份',
      backupFile
    });
  } catch (error) {
    console.error('备份配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 分析日志
app.get('/api/logs/analyze', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const level = req.query.level || 'all';
    const keyword = req.query.keyword || '';

    const analysis = await logAnalyzer.analyzeLogs({ hours, level, keyword });
    res.json(analysis);
  } catch (error) {
    console.error('分析日志失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取错误统计
app.get('/api/logs/errors/stats', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const stats = await logAnalyzer.getErrorStats(hours);
    res.json(stats);
  } catch (error) {
    console.error('获取错误统计失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取错误模式
app.get('/api/logs/patterns', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const patterns = await logAnalyzer.getErrorPatterns(hours);
    res.json(patterns);
  } catch (error) {
    console.error('获取错误模式失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 快捷操作：导出报告（保持向后兼容）
app.get('/api/actions/export-report', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    
    if (format === 'html') {
      return res.redirect(`/api/export/report`);
    } else if (format === 'csv') {
      return res.redirect(`/api/export/csv?type=all`);
    } else {
      return res.redirect(`/api/export/json`);
    }
  } catch (error) {
    console.error('导出报告失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 调试端点：检查静态文件路径
app.get('/api/debug/static-path', (req, res) => {
  const fs = require('fs');
  res.json({
    __dirname: __dirname,
    staticDir: staticDir,
    staticDirExists: fs.existsSync(staticDir),
    cssPath: path.join(staticDir, 'css', 'style.css'),
    cssExists: fs.existsSync(path.join(staticDir, 'css', 'style.css')),
    jsPath: path.join(staticDir, 'js', 'dashboard.js'),
    jsExists: fs.existsSync(path.join(staticDir, 'js', 'dashboard.js'))
  });
});

// 完整数据（用于初始化）
app.get('/api/dashboard', async (req, res) => {
  try {
    // 并行获取所有数据以提高性能
    const [system, agents, tasks, channels, models, logs, health] = await Promise.all([
      collector.getSystemOverview(),
      collector.getAgentsList(),
      collector.getTasks(),
      collector.getChannelsStatus(),
      collector.getModelsQuota(),
      collector.getRecentLogs(50),
      collector.getHealthStatus()
    ]);

    // 调试：打印模型配额信息
    console.log('[API] /api/dashboard 返回的模型数据:');
    if (models && models.length > 0) {
      models.forEach(m => {
        console.log(`  ${m.provider} - ${m.name}: quotaUsed=${m.quotaUsed} (${typeof m.quotaUsed}), quotaTotal=${m.quotaTotal} (${typeof m.quotaTotal})`);
      });
      
      // 检查是否有非零配额
      const modelsWithQuota = models.filter(m => m.quotaTotal > 0);
      if (modelsWithQuota.length > 0) {
        console.log(`[API] ✅ 找到 ${modelsWithQuota.length} 个有配额的模型`);
        modelsWithQuota.forEach(m => {
          console.log(`  ✅ ${m.provider} - ${m.name}: ${m.quotaTotal}`);
        });
      } else {
        console.log(`[API] ⚠️ 警告: 所有模型的配额都是 0`);
      }
    } else {
      console.log('  [警告] 模型数据为空');
    }

    // 获取活跃告警
    const activeAlerts = alertManager.getActiveAlerts();

    const data = {
      system,
      agents,
      tasks,
      channels,
      models,
      logs,
      health,
      alerts: activeAlerts,
      timestamp: new Date().toISOString()
    };
    res.json(data);
  } catch (error) {
    console.error('获取完整数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 首页 - 支持侧边栏布局切换
app.get('/', (req, res) => {
  const layout = req.query.layout || 'default'; // default 或 sidebar
  const htmlFile = layout === 'sidebar' ? 'index-sidebar.html' : 'index.html';
  const htmlPath = path.join(__dirname, htmlFile);
  res.sendFile(htmlPath, (err) => {
    if (err) {
      console.error('发送首页失败:', err);
      res.status(500).send(`
        <h1>无法加载页面</h1>
        <p>错误: ${err.message}</p>
        <p>文件路径: ${htmlPath}</p>
      `);
    }
  });
});

// 启动服务器
server.listen(PORT, HOST, () => {
  console.log(`\n🎩 OpenClaw作战指挥中心看板服务器`);
  console.log(`   访问地址: http://${HOST}:${PORT}`);
  console.log(`   静态文件: ${path.join(__dirname, 'static')}`);
  console.log(`   配置文件: ${path.join(require('os').homedir(), '.openclaw', 'openclaw.json')}\n`);
  startPeriodicUpdates();
  startHistoryRecording();
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  if (updateInterval) clearInterval(updateInterval);
  if (historyRecordInterval) clearInterval(historyRecordInterval);
  configWatcher.close();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  if (updateInterval) clearInterval(updateInterval);
  if (historyRecordInterval) clearInterval(historyRecordInterval);
  configWatcher.close();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
