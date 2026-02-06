const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const execAsync = promisify(exec);

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(OPENCLAW_HOME, 'openclaw.json');
const LOGS_DIR = path.join(OPENCLAW_HOME, 'logs');
const AGENTS_DIR = path.join(OPENCLAW_HOME, 'agents');
const DATA_DIR = path.join(__dirname, 'data');

class DataCollector {
  constructor() {
    this.configCache = null;
    this.lastLogRead = {};
    this.cache = {
      system: null,
      agents: null,
      tasks: null,
      channels: null,
      models: null,
      health: null
    };
    this.cacheTimeout = 2000; // 缓存2秒
    this.cacheTimestamps = {};
    this.initDataDir();
  }

  // 初始化数据目录
  async initDataDir() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
      console.error('创建数据目录失败:', error);
    }
  }

  // 读取配置文件
  async getConfig() {
    if (this.configCache) {
      return this.configCache;
    }
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.configCache = JSON.parse(content);
      return this.configCache;
    } catch (error) {
      console.error('读取配置文件失败:', error);
      return null;
    }
  }

  // 检查缓存
  _isCacheValid(key) {
    if (!this.cache[key] || !this.cacheTimestamps[key]) return false;
    const age = Date.now() - this.cacheTimestamps[key];
    return age < this.cacheTimeout;
  }

  // 设置缓存
  _setCache(key, value) {
    this.cache[key] = value;
    this.cacheTimestamps[key] = Date.now();
  }

  // 获取系统概览信息
  async getSystemOverview() {
    if (this._isCacheValid('system')) {
      return this.cache.system;
    }

    try {
      const config = await this.getConfig();
      const hostname = os.hostname();
      const platform = os.platform();
      const arch = os.arch();
      const nodeVersion = process.version;
      
      // 获取Gateway进程信息
      const gatewayInfo = await this.getProcessInfo('openclaw-gateway');
      
      // 获取系统运行时间
      const uptime = os.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      
      const result = {
        hostname,
        platform,
        arch,
        nodeVersion,
        gateway: {
          port: config?.gateway?.port || 18789,
          status: gatewayInfo ? 'running' : 'stopped',
          pid: gatewayInfo?.pid || null,
          cpu: gatewayInfo?.cpu || '0%',
          memory: gatewayInfo?.memory || '0 MB',
          uptime: gatewayInfo ? `${uptimeHours}小时 ${uptimeMinutes}分钟` : 'N/A'
        },
        configLoaded: config !== null
      };

      this._setCache('system', result);
      return result;
    } catch (error) {
      console.error('获取系统概览失败:', error);
      return this.cache.system || {
        hostname: 'N/A',
        platform: 'N/A',
        arch: 'N/A',
        nodeVersion: 'N/A',
        gateway: { status: 'unknown' },
        configLoaded: false
      };
    }
  }

  // 获取进程信息
  async getProcessInfo(processName) {
    try {
      const { stdout } = await execAsync(`ps aux | grep "${processName}" | grep -v grep`);
      const lines = stdout.trim().split('\n');
      if (lines.length === 0) return null;
      
      // 解析ps输出
      const parts = lines[0].trim().split(/\s+/);
      if (parts.length < 11) return null;
      
      return {
        pid: parts[1],
        cpu: parts[2] + '%',
        memory: parts[5] + ' KB',
        command: parts.slice(10).join(' ')
      };
    } catch (error) {
      return null;
    }
  }

  // 获取所有Agent列表和状态（含磁盘上发现的子agent）
  async getAgentsList() {
    const config = await this.getConfig();
    const configList = (config && config.agents && config.agents.list) ? config.agents.list : [];

    // 岗位映射（根据 agent id 或配置中的 role 字段）
    const roleMap = {
      'main': '总管理',
      'assistant': '助理',
      'system-engineer': '系统工程师',
      'health-expert': '健康顾问',
      'coder': '程序员',
      'designer': '设计师',
      'writer': '文案',
      'analyst': '分析师',
      'tester': '测试工程师',
      'devops': '运维工程师'
    };

    const agents = [];
    const seenIds = new Set();
    
    // 1) 先从配置里读取（保留完整信息）
    for (const agentConfig of configList) {
      const agentId = agentConfig.id;
      seenIds.add(agentId);
      const agentDir = path.join(AGENTS_DIR, agentId);
      
      const status = await this.getAgentStatus(agentId, agentDir);
      
      const defaultModel = agentConfig.model?.primary || config.agents.defaults?.model?.primary || 'N/A';
      const currentModel = status.currentModel || defaultModel;
      const role = agentConfig.identity?.role || roleMap[agentId] || '通用助手';
      
      agents.push({
        id: agentId,
        name: agentConfig.identity?.name || agentId,
        emoji: agentConfig.identity?.emoji || '🤖',
        role: role,
        model: currentModel,
        defaultModel: defaultModel,
        subagents: agentConfig.subagents?.allowAgents || [],
        status: status.status,
        sessionCount: status.sessionCount,
        lastActivity: status.lastActivity,
        workspace: agentConfig.workspace || config.agents.defaults?.workspace || 'N/A'
      });
    }
    
    // 2) 扫描磁盘 ~/.openclaw/agents/ 补充不在配置里的子agent
    try {
      const dirs = await fs.readdir(AGENTS_DIR).catch(() => []);
      for (const dirName of dirs) {
        if (seenIds.has(dirName)) continue;
        // 确认是目录且包含 sessions 子目录
        const agentDir = path.join(AGENTS_DIR, dirName);
        const stat = await fs.stat(agentDir).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;
        const sessionsDir = path.join(agentDir, 'sessions');
        const sessionsStat = await fs.stat(sessionsDir).catch(() => null);
        if (!sessionsStat || !sessionsStat.isDirectory()) continue;

        seenIds.add(dirName);
        const status = await this.getAgentStatus(dirName, agentDir);
        // 如果没有任何会话，跳过（避免显示空壳目录）
        if (status.sessionCount === 0) continue;

        // 尝试从 configs 对象获取补充信息
        const cfgExtra = config?.agents?.configs?.[dirName] || {};
        const role = cfgExtra.identity?.role || roleMap[dirName] || '子Agent';

        agents.push({
          id: dirName,
          name: cfgExtra.identity?.name || dirName,
          emoji: cfgExtra.identity?.emoji || '🧩',
          role: role,
          model: status.currentModel || cfgExtra.model?.primary || 'N/A',
          defaultModel: cfgExtra.model?.primary || 'N/A',
          subagents: [],
          status: status.status,
          sessionCount: status.sessionCount,
          lastActivity: status.lastActivity,
          workspace: cfgExtra.workspace || 'N/A',
          _discoveredFromDisk: true  // 标记：从磁盘发现而非配置
        });
      }
    } catch (error) {
      console.error('扫描agents目录发现子agent失败:', error);
    }
    
    return agents;
  }

  // 获取单个Agent状态
  async getAgentStatus(agentId, agentDir) {
    try {
      const sessionsDir = path.join(agentDir, 'sessions');
      const files = await fs.readdir(sessionsDir).catch(() => []);
      
      // 统计活跃会话（非deleted文件）
      const activeSessions = files.filter(f => 
        f.endsWith('.jsonl') && !f.includes('.deleted.')
      );
      
      // 获取最近活动时间和最新会话文件
      let lastActivity = null;
      let latestSessionFile = null;
      let latestMtime = null;
      
      if (activeSessions.length > 0) {
        const statsWithFiles = await Promise.all(
          activeSessions.map(async f => {
            const stat = await fs.stat(path.join(sessionsDir, f)).catch(() => null);
            return stat ? { file: f, stat } : null;
          })
        );
        const validStats = statsWithFiles.filter(s => s !== null);
        if (validStats.length > 0) {
          const latest = validStats.reduce((latest, current) => 
            current.stat.mtime > latest.stat.mtime ? current : latest
          );
          lastActivity = latest.stat.mtime.toISOString();
          latestSessionFile = latest.file;
          latestMtime = latest.stat.mtime;
        }
      }
      
      // 从最新会话文件中读取当前使用的模型
      let currentModel = null;
      if (latestSessionFile) {
        currentModel = await this._getModelFromSession(path.join(sessionsDir, latestSessionFile));
      }
      
      return {
        status: activeSessions.length > 0 ? 'active' : 'idle',
        sessionCount: activeSessions.length,
        lastActivity,
        currentModel
      };
    } catch (error) {
      return {
        status: 'unknown',
        sessionCount: 0,
        lastActivity: null,
        currentModel: null
      };
    }
  }

  // 从会话文件中提取当前使用的模型
  async _getModelFromSession(sessionFilePath) {
    try {
      const content = await fs.readFile(sessionFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      
      // 从后往前查找最新的 model_change 或 model-snapshot
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          
          // 检查 model_change 类型
          if (entry.type === 'model_change' && entry.provider && entry.modelId) {
            return `${entry.provider}/${entry.modelId}`;
          }
          
          // 检查 model-snapshot 类型
          if (entry.type === 'custom' && entry.customType === 'model-snapshot' && entry.data) {
            const data = entry.data;
            if (data.provider && data.modelId) {
              return `${data.provider}/${data.modelId}`;
            }
          }
          
          // 检查 assistant message 中的 provider 和 model
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            if (entry.message.provider && entry.message.model) {
              return `${entry.message.provider}/${entry.message.model}`;
            }
          }
        } catch (e) {
          // 忽略解析错误，继续下一行
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  // 从原始文本中提取有意义的任务标题（去除代码、路径等噪音）
  _extractTaskTitle(rawContent, maxLen = 60) {
    if (!rawContent || !rawContent.trim()) return '(无标题)';

    let text = rawContent;

    // 1. 去除 markdown 代码块（```...```）
    text = text.replace(/```[\s\S]*?```/g, '');
    // 2. 去除行内代码（`...`）
    text = text.replace(/`[^`]+`/g, '');
    // 3. 去除 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    // 4. 去除长文件路径（如 /Users/xxx/... 或 C:\xxx\...）
    text = text.replace(/(?:\/[\w.\-]+){3,}/g, '');
    text = text.replace(/(?:[A-Z]:\\[\w.\-\\]+)/g, '');
    // 5. 去除 URL
    text = text.replace(/https?:\/\/\S+/g, '');
    // 6. 去除时间戳和日期信息（各种常见格式）
    text = text.replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?(Z|[+-]\d{1,2}:?\d{0,2})?/g, '');
    text = text.replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, '');
    text = text.replace(/\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?/gi, '');
    text = text.replace(/GMT[+-]?\d*/gi, '');
    // 7. 去除 JSON 片段（{ ... } 超过50字符的）
    text = text.replace(/\{[^}]{50,}\}/g, '');
    // 7. 去除连续的特殊字符行（如分隔线 ===, ---, ***）
    text = text.replace(/^[\s=\-*#>|]{3,}$/gm, '');
    // 8. 合并多余空白
    text = text.replace(/\s+/g, ' ').trim();

    if (!text) return '(无标题)';

    // 优先取第一个问句（以？结尾的句子）
    const questionMatch = text.match(/[^。！？.!?\n]*[？?][^。！？.!?\n]*/);
    if (questionMatch) {
      const q = questionMatch[0].trim();
      if (q.length >= 4 && q.length <= maxLen) return q;
      if (q.length > maxLen) return q.substring(0, maxLen) + '...';
    }

    // 否则取第一个有意义的句子（中文句号、英文句号、换行分割）
    const sentences = text.split(/[。！？.!?\n]/).filter(s => s.trim().length >= 4);
    if (sentences.length > 0) {
      const first = sentences[0].trim();
      if (first.length <= maxLen) return first;
      return first.substring(0, maxLen) + '...';
    }

    // 兜底：直接截断
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  // 获取任务列表
  async getTasks() {
    const agents = await this.getAgentsList();
    const tasks = {
      current: [],
      history: []
    };

    // 从会话文件中提取任务信息
    for (const agent of agents) {
      const agentDir = path.join(AGENTS_DIR, agent.id, 'sessions');
      try {
        const files = await fs.readdir(agentDir).catch(() => []);
        const sessionFiles = files.filter(f => 
          f.endsWith('.jsonl') && !f.includes('.deleted.')
        );

        for (const file of sessionFiles.slice(0, 10)) { // 只处理最近10个会话
          const filePath = path.join(agentDir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (!stats) continue;

          // 读取会话文件的最后几行
          const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
          const lines = content.trim().split('\n').filter(l => l);
          
          if (lines.length > 0) {
            try {
              const lastMessage = JSON.parse(lines[lines.length - 1]);

              // 提取任务标题：从前几条用户消息中智能提取
              let title = '';
              for (const line of lines) {
                try {
                  const entry = JSON.parse(line);
                  if (entry.type === 'message' && entry.message && entry.message.role === 'user') {
                    let rawContent = '';
                    if (typeof entry.message.content === 'string') {
                      rawContent = entry.message.content;
                    } else if (Array.isArray(entry.message.content)) {
                      rawContent = entry.message.content
                        .filter(c => c.type === 'text')
                        .map(c => c.text)
                        .join(' ');
                    }
                    const extracted = this._extractTaskTitle(rawContent);
                    if (extracted && extracted !== '(无标题)') {
                      title = extracted;
                      break;
                    }
                  }
                } catch (e) { /* skip */ }
              }

              const task = {
                id: file.replace('.jsonl', ''),
                agentId: agent.id,
                agentName: agent.name,
                title: title || '(无标题)',
                status: 'active',
                lastUpdate: stats.mtime.toISOString(),
                messageCount: lines.length
              };
              
              // 判断是否为当前任务（最近5分钟内有更新）
              const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
              if (stats.mtime.getTime() > fiveMinutesAgo) {
                tasks.current.push(task);
              } else {
                tasks.history.push(task);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }

    // 按时间排序
    tasks.current.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    tasks.history.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    tasks.history = tasks.history.slice(0, 20); // 只保留最近20条历史

    return tasks;
  }

  // 获取通道状态
  async getChannelsStatus() {
    const config = await this.getConfig();
    if (!config || !config.channels) {
      return [];
    }

    const channels = [];
    const channelConfigs = config.channels;

    // 检查各通道配置和状态
    for (const [channelName, channelConfig] of Object.entries(channelConfigs)) {
      const enabled = channelConfig.enabled !== false;
      
      // 从日志中检查通道状态
      const logStatus = await this.checkChannelInLogs(channelName);
      
      channels.push({
        name: channelName,
        enabled,
        status: enabled ? (logStatus.healthy ? 'normal' : 'warning') : 'disabled',
        lastMessage: logStatus.lastMessage,
        messageCount: logStatus.messageCount
      });
    }

    return channels;
  }

  // 从日志中检查通道状态
  async checkChannelInLogs(channelName) {
    try {
      const logFile = path.join(LOGS_DIR, 'gateway.err.log');
      const content = await fs.readFile(logFile, 'utf-8').catch(() => '');
      const lines = content.split('\n').slice(-100); // 检查最近100行
      
      let lastMessage = null;
      let messageCount = 0;
      let hasError = false;
      
      for (const line of lines) {
        if (line.includes(`[${channelName}]`)) {
          messageCount++;
          const match = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
          if (match) {
            lastMessage = match[1];
          }
          if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
            hasError = true;
          }
        }
      }
      
      return {
        healthy: !hasError,
        lastMessage,
        messageCount
      };
    } catch (error) {
      return {
        healthy: true,
        lastMessage: null,
        messageCount: 0
      };
    }
  }

  // 获取模型配额信息
  // HTTP 请求辅助函数
  async _httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const requestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: options.headers || {}
        };

        console.log(`[HTTP请求] ${requestOptions.method} ${url}`);
        console.log(`[HTTP请求] Headers:`, JSON.stringify(requestOptions.headers, null, 2));

        const req = client.request(requestOptions, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            console.log(`[HTTP请求] 响应状态码: ${res.statusCode}`);
            console.log(`[HTTP请求] 响应头:`, res.headers);
            console.log(`[HTTP请求] 响应体:`, data);
            
            try {
              const jsonData = JSON.parse(data);
              resolve({ statusCode: res.statusCode, headers: res.headers, data: jsonData });
            } catch (error) {
              // 如果不是 JSON，返回原始数据
              console.warn(`[HTTP请求] 响应不是有效的 JSON:`, error.message);
              resolve({ statusCode: res.statusCode, headers: res.headers, data: data });
            }
          });
        });

        req.on('error', (error) => {
          console.error(`[HTTP请求] 请求错误:`, error.message);
          console.error(`[HTTP请求] 错误堆栈:`, error.stack);
          reject(error);
        });

        req.setTimeout(10000, () => {
          console.error(`[HTTP请求] 请求超时`);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        if (options.body) {
          req.write(options.body);
        }

        req.end();
      } catch (error) {
        console.error(`[HTTP请求] 创建请求失败:`, error.message);
        reject(error);
      }
    });
  }

  // 查询 Minimax Coding 余额
  async _queryMinimaxQuota(apiKey) {
    try {
      const url = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
      console.log(`[余额查询] 查询 Minimax 余额，URL: ${url}`);
      
      const response = await this._httpRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[余额查询] Minimax 响应状态码: ${response.statusCode}`);
      console.log(`[余额查询] Minimax 响应数据:`, JSON.stringify(response.data, null, 2));

      if (response.statusCode === 200 && response.data) {
        const data = response.data;
        // 数据在 model_remains 数组中
        const modelRemains = data.model_remains && data.model_remains[0];
        if (modelRemains) {
          const total = modelRemains.current_interval_total_count || 0;
          const used = modelRemains.current_interval_usage_count || 0;
          const result = {
            quotaUsed: used,
            quotaTotal: total,
            remainsTime: modelRemains.remains_time || 0
          };
          console.log(`[余额查询] Minimax 解析结果:`, result);
          return result;
        } else {
          console.warn(`[余额查询] Minimax API 返回数据中没有 model_remains`);
        }
      } else {
        console.warn(`[余额查询] Minimax API 返回非 200 状态码: ${response.statusCode}`);
        if (response.data) {
          console.warn(`[余额查询] Minimax API 错误响应:`, JSON.stringify(response.data, null, 2));
        }
      }
    } catch (error) {
      console.error('[余额查询] 查询 Minimax 余额失败:', error.message);
      console.error('[余额查询] 错误堆栈:', error.stack);
    }
    return { quotaUsed: 0, quotaTotal: 0, remainsTime: 0 };
  }

  // 查询 Moonshot (Kimi) 余额
  // 官方文档: https://platform.moonshot.ai/docs/api/balance
  // API 地址: https://api.moonshot.ai/v1/users/me/balance
  // 响应格式: { "code": 0, "data": { "available_balance": number, "voucher_balance": number, "cash_balance": number }, "status": true }
  async _queryMoonshotQuota(apiKey) {
    // 尝试两个可能的域名：.ai (国际站) 和 .cn (中国站)
    const urls = [
      'https://api.moonshot.ai/v1/users/me/balance',
      'https://api.moonshot.cn/v1/users/me/balance'
    ];
    
    for (const url of urls) {
      try {
        console.log(`[余额查询] 查询 Moonshot 余额，URL: ${url}`);
        
        const response = await this._httpRequest(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`[余额查询] Moonshot 响应状态码: ${response.statusCode}`);
        console.log(`[余额查询] Moonshot 响应数据:`, JSON.stringify(response.data, null, 2));

        if (response.statusCode === 200 && response.data) {
          const data = response.data;
          
          // 根据官方文档，响应格式为: { code: 0, data: { available_balance: number, ... }, status: true }
          let balance = 0;
          if (data.code === 0 && data.data && typeof data.data.available_balance === 'number') {
            // 官方格式：data.data.available_balance
            balance = data.data.available_balance;
          } else if (data.data && typeof data.data.available === 'number') {
            // 兼容其他可能的格式
            balance = data.data.available;
          } else if (typeof data.balance === 'number') {
            balance = data.balance;
          } else if (typeof data.available_balance === 'number') {
            balance = data.available_balance;
          } else if (typeof data.available === 'number') {
            balance = data.available;
          }
          
          const result = {
            quotaUsed: 0, // Moonshot 不提供已使用量，只提供余额
            quotaTotal: balance,
            balance: balance,
            voucherBalance: data.data?.voucher_balance || 0,
            cashBalance: data.data?.cash_balance || 0
          };
          console.log(`[余额查询] Moonshot 解析结果:`, result);
          return result;
        } else {
          console.warn(`[余额查询] Moonshot API (${url}) 返回非 200 状态码: ${response.statusCode}`);
          if (response.data) {
            console.warn(`[余额查询] Moonshot API 错误响应:`, JSON.stringify(response.data, null, 2));
          }
          // 如果第一个 URL 失败，尝试下一个
          continue;
        }
      } catch (error) {
        console.error(`[余额查询] 查询 Moonshot 余额失败 (${url}):`, error.message);
        if (error.code === 'ENOTFOUND') {
          console.log(`[余额查询] DNS 解析失败，尝试下一个域名...`);
          continue; // 尝试下一个 URL
        } else {
          console.error('[余额查询] 错误堆栈:', error.stack);
          // 如果是其他错误，也尝试下一个 URL
          continue;
        }
      }
    }
    
    // 所有 URL 都失败
    console.error('[余额查询] 所有 Moonshot API 地址都查询失败');
    return { quotaUsed: 0, quotaTotal: 0, balance: 0 };
  }

  async getModelsQuota() {
    console.log(`[余额查询] ========== 开始查询模型配额 ==========`);
    const config = await this.getConfig();
    if (!config || !config.models || !config.models.providers) {
      console.log(`[余额查询] 配置为空，返回空数组`);
      return [];
    }

    const models = [];
    const providers = Object.keys(config.models.providers);
    console.log(`[余额查询] 找到 ${providers.length} 个提供商:`, providers);
    
    for (const [providerName, providerConfig] of Object.entries(config.models.providers)) {
      if (!providerConfig.models) {
        console.log(`[余额查询] 提供商 ${providerName} 没有模型配置，跳过`);
        continue;
      }
      
      // 获取该提供商的 API Key
      const apiKey = providerConfig.apiKey;
      console.log(`[余额查询] 处理提供商: ${providerName}, 有 API Key: ${!!apiKey}, 模型数量: ${providerConfig.models.length}`);
      
      // 根据提供商查询余额（同一提供商的模型共享余额）
      let quotaInfo = { quotaUsed: 0, quotaTotal: 0 };
      if (apiKey) {
        try {
          console.log(`[余额查询] 开始查询提供商 ${providerName} 的余额，API Key: ${apiKey.substring(0, 20)}...`);
          // 只有 minimax-coding 有余额查询接口
          if (providerName === 'minimax-coding') {
            console.log(`[余额查询] 调用 Minimax 余额查询...`);
            quotaInfo = await this._queryMinimaxQuota(apiKey);
            console.log(`[余额查询] Minimax 查询完成，结果:`, JSON.stringify(quotaInfo));
          } else if (providerName.includes('moonshot') || providerName.includes('kimi')) {
            console.log(`[余额查询] 调用 Moonshot 余额查询...`);
            quotaInfo = await this._queryMoonshotQuota(apiKey);
            console.log(`[余额查询] Moonshot 查询完成，结果:`, JSON.stringify(quotaInfo));
          } else {
            console.log(`[余额查询] 提供商 ${providerName} 暂不支持余额查询`);
          }
          console.log(`[余额查询] 提供商 ${providerName} 最终查询结果: quotaUsed=${quotaInfo.quotaUsed}, quotaTotal=${quotaInfo.quotaTotal}`);
        } catch (error) {
          console.error(`[余额查询] ❌ 查询 ${providerName} 余额失败:`, error.message);
          console.error(`[余额查询] 错误堆栈:`, error.stack);
        }
      } else {
        console.log(`[余额查询] ⚠️ 提供商 ${providerName} 没有配置 API Key`);
      }
      
      // 为每个模型创建记录，共享同一提供商的余额信息
      for (const model of providerConfig.models) {
        const modelData = {
          provider: providerName,
          id: model.id,
          name: model.name || model.id,
          cost: model.cost || {},
          contextWindow: model.contextWindow || 0,
          maxTokens: model.maxTokens || 0,
          quotaUsed: Number(quotaInfo.quotaUsed) || 0,
          quotaTotal: Number(quotaInfo.quotaTotal) || 0,
          status: 'normal',
          // 保留额外的配额信息
          quotaExtra: quotaInfo.remainsTime || quotaInfo.balance || null
        };
        
        console.log(`[余额查询] 创建模型记录: ${modelData.name}, quotaUsed=${modelData.quotaUsed}, quotaTotal=${modelData.quotaTotal}`);
        models.push(modelData);
      }
    }

    console.log(`[余额查询] ========== 查询完成 ==========`);
    console.log(`[余额查询] 总共返回 ${models.length} 个模型`);
    console.log(`[余额查询] 模型配额汇总:`);
    models.forEach(m => {
      console.log(`  ${m.provider} - ${m.name}: quotaUsed=${m.quotaUsed} (${typeof m.quotaUsed}), quotaTotal=${m.quotaTotal} (${typeof m.quotaTotal})`);
    });
    
    // 检查是否有非零配额
    const modelsWithQuota = models.filter(m => Number(m.quotaTotal) > 0);
    if (modelsWithQuota.length > 0) {
      console.log(`[余额查询] ✅ 找到 ${modelsWithQuota.length} 个有配额的模型:`);
      modelsWithQuota.forEach(m => {
        console.log(`  ✅ ${m.provider} - ${m.name}: quotaTotal=${m.quotaTotal}`);
      });
    } else {
      console.log(`[余额查询] ⚠️ 警告: 所有模型的配额都是 0，可能查询失败`);
    }
    
    // 确保返回的数据是正确的
    const result = models.map(m => ({
      ...m,
      quotaUsed: Number(m.quotaUsed) || 0,
      quotaTotal: Number(m.quotaTotal) || 0
    }));
    
    console.log(`[余额查询] 返回数据前最后检查:`);
    result.forEach(m => {
      if (m.quotaTotal > 0) {
        console.log(`  ✅ ${m.provider} - ${m.name}: quotaTotal=${m.quotaTotal}`);
      }
    });
    
    return result;
  }

  // 获取最近日志（优化：只读取文件末尾）
  async getRecentLogs(count = 50) {
    try {
      const logFile = path.join(LOGS_DIR, 'gateway.err.log');
      const stats = await fs.stat(logFile).catch(() => null);
      if (!stats) return [];

      // 只读取文件末尾部分（假设每行平均200字符）
      const estimatedBytes = count * 200;
      const startPos = Math.max(0, stats.size - estimatedBytes);
      
      const fileHandle = await fs.open(logFile, 'r');
      const buffer = Buffer.alloc(stats.size - startPos);
      await fileHandle.read(buffer, 0, buffer.length, startPos);
      await fileHandle.close();
      
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      const recentLines = lines.slice(-count);
      const logs = recentLines.map(line => {
        const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
        const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
        
        let level = 'info';
        if (line.toLowerCase().includes('error')) level = 'error';
        else if (line.toLowerCase().includes('warn')) level = 'warn';
        
        return {
          timestamp,
          level,
          message: line
        };
      });
      
      return logs;
    } catch (error) {
      console.error('读取日志失败:', error);
      return [];
    }
  }

  // 获取系统健康度
  async getHealthStatus() {
    const systemOverview = await this.getSystemOverview();
    const agents = await this.getAgentsList();
    const channels = await this.getChannelsStatus();
    const logs = await this.getRecentLogs(100);
    
    let score = 100;
    const issues = [];
    
    // 检查Gateway状态
    if (systemOverview.gateway.status !== 'running') {
      score -= 30;
      issues.push({ type: 'critical', message: 'Gateway进程未运行' });
    }
    
    // 检查通道状态
    const failedChannels = channels.filter(c => c.status === 'warning' && c.enabled);
    if (failedChannels.length > 0) {
      score -= failedChannels.length * 10;
      issues.push({
        type: 'warning',
        message: `${failedChannels.length}个通道状态异常`
      });
    }
    
    // 检查错误日志
    const recentErrors = logs.filter(l => l.level === 'error').length;
    if (recentErrors > 10) {
      score -= 20;
      issues.push({
        type: 'warning',
        message: `最近有${recentErrors}条错误日志`
      });
    }
    
    // 检查Agent状态
    const inactiveAgents = agents.filter(a => a.status === 'unknown');
    if (inactiveAgents.length > 0) {
      score -= inactiveAgents.length * 5;
    }
    
    score = Math.max(0, score);
    
    let status = 'healthy';
    if (score < 50) status = 'critical';
    else if (score < 80) status = 'warning';
    
    return {
      score,
      status,
      issues
    };
  }

  // 清除配置缓存
  clearCache() {
    this.configCache = null;
    // 清除所有数据缓存
    Object.keys(this.cache).forEach(key => {
      this.cache[key] = null;
      this.cacheTimestamps[key] = 0;
    });
  }

  // ========== 历史数据采集和存储 ==========

  // 读取历史数据文件
  async _readHistoryFile(filename) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 文件不存在时返回空数组
      return { data: [], lastUpdate: null };
    }
  }

  // 写入历史数据文件
  async _writeHistoryFile(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`写入历史数据文件失败 ${filename}:`, error);
    }
  }

  // 清理旧数据（保留最近30天）
  _cleanOldData(dataArray, maxDays = 30) {
    const cutoffTime = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    return dataArray.filter(item => {
      const timestamp = typeof item.timestamp === 'string' 
        ? new Date(item.timestamp).getTime() 
        : item.timestamp;
      return timestamp >= cutoffTime;
    });
  }

  // 记录性能指标历史
  async recordMetricsHistory() {
    try {
      const system = await this.getSystemOverview();
      const gatewayInfo = await this.getProcessInfo('openclaw-gateway');
      
      // 解析CPU和内存
      const cpu = gatewayInfo ? parseFloat(gatewayInfo.cpu.replace('%', '')) : 0;
      const memoryKB = gatewayInfo ? parseInt(gatewayInfo.memory.replace(' KB', '')) : 0;
      const memoryMB = memoryKB / 1024;

      const metric = {
        timestamp: new Date().toISOString(),
        cpu: cpu,
        memory: memoryMB,
        gatewayStatus: system.gateway.status
      };

      const history = await this._readHistoryFile('metrics-history.json');
      history.data = history.data || [];
      history.data.push(metric);
      history.data = this._cleanOldData(history.data);
      history.lastUpdate = new Date().toISOString();

      await this._writeHistoryFile('metrics-history.json', history);
    } catch (error) {
      console.error('记录性能指标历史失败:', error);
    }
  }

  // 获取性能指标历史
  async getMetricsHistory(hours = 24) {
    try {
      const history = await this._readHistoryFile('metrics-history.json');
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      
      const filtered = (history.data || []).filter(item => {
        const timestamp = new Date(item.timestamp).getTime();
        return timestamp >= cutoffTime;
      });

      return {
        labels: filtered.map(item => {
          const date = new Date(item.timestamp);
          return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }),
        cpu: filtered.map(item => item.cpu || 0),
        memory: filtered.map(item => item.memory || 0)
      };
    } catch (error) {
      console.error('获取性能指标历史失败:', error);
      return { labels: [], cpu: [], memory: [] };
    }
  }

  // 记录消息统计
  async recordChannelStats() {
    try {
      const channels = await this.getChannelsStatus();
      const timestamp = new Date().toISOString();
      const dateKey = timestamp.split('T')[0]; // YYYY-MM-DD

      const history = await this._readHistoryFile('channels-stats.json');
      history.data = history.data || {};
      
      if (!history.data[dateKey]) {
        history.data[dateKey] = {};
      }

      channels.forEach(channel => {
        if (!history.data[dateKey][channel.name]) {
          history.data[dateKey][channel.name] = {
            total: 0,
            hourly: {}
          };
        }
        
        const hour = new Date(timestamp).getHours();
        const hourKey = `${hour}:00`;
        
        if (!history.data[dateKey][channel.name].hourly[hourKey]) {
          history.data[dateKey][channel.name].hourly[hourKey] = 0;
        }
        
        history.data[dateKey][channel.name].hourly[hourKey] += channel.messageCount || 0;
        history.data[dateKey][channel.name].total += channel.messageCount || 0;
      });

      history.lastUpdate = timestamp;
      await this._writeHistoryFile('channels-stats.json', history);
    } catch (error) {
      console.error('记录消息统计失败:', error);
    }
  }

  // 获取消息统计
  async getChannelsStats(range = 'today') {
    try {
      const history = await this._readHistoryFile('channels-stats.json');
      const now = new Date();
      let dateKey;
      
      if (range === 'today') {
        dateKey = now.toISOString().split('T')[0];
      } else if (range === 'week') {
        // 获取最近7天的数据
        const stats = {};
        for (let i = 0; i < 7; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const key = date.toISOString().split('T')[0];
          if (history.data && history.data[key]) {
            Object.assign(stats, history.data[key]);
          }
        }
        return this._aggregateChannelStats(stats, 'week');
      } else if (range === 'month') {
        // 获取最近30天的数据
        const stats = {};
        for (let i = 0; i < 30; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const key = date.toISOString().split('T')[0];
          if (history.data && history.data[key]) {
            Object.assign(stats, history.data[key]);
          }
        }
        return this._aggregateChannelStats(stats, 'month');
      }

      const dayData = history.data && history.data[dateKey] ? history.data[dateKey] : {};
      const channels = Object.keys(dayData);
      
      return {
        labels: channels,
        data: channels.map(channel => dayData[channel].total || 0),
        hourly: channels.reduce((acc, channel) => {
          acc[channel] = Object.entries(dayData[channel].hourly || {})
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hour, count]) => ({ hour, count }));
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('获取消息统计失败:', error);
      return { labels: [], data: [], hourly: {} };
    }
  }

  // 聚合通道统计数据
  _aggregateChannelStats(stats, range) {
    const aggregated = {};
    
    Object.keys(stats).forEach(channel => {
      if (!aggregated[channel]) {
        aggregated[channel] = 0;
      }
      aggregated[channel] += stats[channel].total || 0;
    });

    return {
      labels: Object.keys(aggregated),
      data: Object.values(aggregated),
      hourly: {}
    };
  }

  // 记录任务执行时间
  async recordTaskStats() {
    try {
      const tasks = await this.getTasks();
      const timestamp = new Date().toISOString();
      
      // 分析任务执行时间分布
      const executionTimes = [];
      
      for (const task of [...tasks.current, ...tasks.history]) {
        try {
          const agentDir = path.join(AGENTS_DIR, task.agentId, 'sessions');
          const sessionFile = path.join(agentDir, `${task.id}.jsonl`);
          const stats = await fs.stat(sessionFile).catch(() => null);
          
          if (stats) {
            // 读取会话文件的第一行和最后一行来估算执行时间
            const content = await fs.readFile(sessionFile, 'utf-8').catch(() => '');
            const lines = content.trim().split('\n').filter(l => l);
            
            if (lines.length >= 2) {
              try {
                const firstMsg = JSON.parse(lines[0]);
                const lastMsg = JSON.parse(lines[lines.length - 1]);
                const startTime = new Date(firstMsg.timestamp || stats.birthtime).getTime();
                const endTime = new Date(lastMsg.timestamp || stats.mtime).getTime();
                const duration = Math.max(0, endTime - startTime) / 1000; // 秒
                
                if (duration > 0 && duration < 3600) { // 忽略超过1小时的任务
                  executionTimes.push(duration);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        } catch (error) {
          // 忽略单个任务错误
        }
      }

      if (executionTimes.length > 0) {
        const history = await this._readHistoryFile('tasks-stats.json');
        history.data = history.data || [];
        history.data.push({
          timestamp,
          executionTimes,
          count: executionTimes.length
        });
        history.data = this._cleanOldData(history.data);
        history.lastUpdate = timestamp;
        await this._writeHistoryFile('tasks-stats.json', history);
      }
    } catch (error) {
      console.error('记录任务统计失败:', error);
    }
  }

  // 获取任务执行时间分布
  async getTasksStats() {
    try {
      const history = await this._readHistoryFile('tasks-stats.json');
      const recentData = (history.data || []).slice(-10); // 最近10次记录
      
      // 合并所有执行时间
      const allTimes = [];
      recentData.forEach(record => {
        if (record.executionTimes) {
          allTimes.push(...record.executionTimes);
        }
      });

      // 创建分布区间（0-10秒，10-30秒，30-60秒，60-120秒，120+秒）
      const bins = [
        { label: '0-10秒', min: 0, max: 10, count: 0 },
        { label: '10-30秒', min: 10, max: 30, count: 0 },
        { label: '30-60秒', min: 30, max: 60, count: 0 },
        { label: '60-120秒', min: 60, max: 120, count: 0 },
        { label: '120+秒', min: 120, max: Infinity, count: 0 }
      ];

      allTimes.forEach(time => {
        const bin = bins.find(b => time >= b.min && time < b.max);
        if (bin) {
          bin.count++;
        }
      });

      return {
        labels: bins.map(b => b.label),
        data: bins.map(b => b.count),
        total: allTimes.length,
        average: allTimes.length > 0 
          ? (allTimes.reduce((a, b) => a + b, 0) / allTimes.length).toFixed(2)
          : 0
      };
    } catch (error) {
      console.error('获取任务统计失败:', error);
      return { labels: [], data: [], total: 0, average: 0 };
    }
  }

  // 记录模型使用统计
  // 从 session 文件中真实统计模型使用量（四个维度）
  async collectModelUsageStats(days = 30) {
    try {
      const config = await this.getConfig();
      const agents = await this.getAgentsList();

      // 构建 model name 映射表（provider/modelId -> displayName）
      const modelNameMap = {};
      if (config && config.models && config.models.providers) {
        for (const [providerName, providerConfig] of Object.entries(config.models.providers)) {
          if (!providerConfig.models) continue;
          for (const model of providerConfig.models) {
            modelNameMap[`${providerName}/${model.id}`] = model.name || model.id;
          }
        }
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // 聚合容器
      const byModelMap = {};    // key: "provider/modelId"
      const byAgentMap = {};    // key: agentId
      const byDayMap = {};      // key: "YYYY-MM-DD"
      let totalCalls = 0;

      for (const agent of agents) {
        const sessionsDir = path.join(AGENTS_DIR, agent.id, 'sessions');
        const files = await fs.readdir(sessionsDir).catch(() => []);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'));

        for (const file of sessionFiles) {
          const filePath = path.join(sessionsDir, file);
          const stat = await fs.stat(filePath).catch(() => null);
          if (!stat) continue;
          // 跳过太旧的文件（修改时间早于统计范围）
          if (stat.mtime < cutoffDate) continue;

          const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
          if (!content) continue;
          const lines = content.trim().split('\n').filter(l => l);

          let currentModel = null; // 从 model_change 追踪当前模型

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              // 追踪 model_change
              if (entry.type === 'model_change' && entry.provider && entry.modelId) {
                currentModel = `${entry.provider}/${entry.modelId}`;
                continue;
              }
              if (entry.type === 'custom' && entry.customType === 'model-snapshot' && entry.data) {
                if (entry.data.provider && entry.data.modelId) {
                  currentModel = `${entry.data.provider}/${entry.data.modelId}`;
                }
                continue;
              }

              // 统计 assistant 消息 = 一次模型调用
              if (entry.type === 'message' && entry.message && entry.message.role === 'assistant') {
                const ts = entry.timestamp ? new Date(entry.timestamp) : null;
                if (ts && ts < cutoffDate) continue;

                // 确定使用的模型
                let modelKey = currentModel;
                if (entry.message.provider && entry.message.model) {
                  modelKey = `${entry.message.provider}/${entry.message.model}`;
                }
                if (!modelKey) modelKey = 'unknown/unknown';

                const dateStr = ts ? ts.toISOString().substring(0, 10) : 'unknown';

                // 按模型
                if (!byModelMap[modelKey]) {
                  const parts = modelKey.split('/');
                  byModelMap[modelKey] = {
                    provider: parts[0],
                    modelId: parts.slice(1).join('/'),
                    modelName: modelNameMap[modelKey] || parts.slice(1).join('/'),
                    count: 0
                  };
                }
                byModelMap[modelKey].count++;

                // 按 Agent
                if (!byAgentMap[agent.id]) {
                  byAgentMap[agent.id] = {
                    agentId: agent.id,
                    agentName: agent.name || agent.id,
                    agentEmoji: agent.emoji || '🤖',
                    models: {},
                    total: 0
                  };
                }
                byAgentMap[agent.id].models[modelKey] = (byAgentMap[agent.id].models[modelKey] || 0) + 1;
                byAgentMap[agent.id].total++;

                // 按天
                if (!byDayMap[dateStr]) {
                  byDayMap[dateStr] = { date: dateStr, counts: {}, total: 0 };
                }
                byDayMap[dateStr].counts[modelKey] = (byDayMap[dateStr].counts[modelKey] || 0) + 1;
                byDayMap[dateStr].total++;

                totalCalls++;
              }
            } catch (e) { /* skip bad line */ }
          }
        }
      }

      // 排序输出
      const byModel = Object.values(byModelMap).sort((a, b) => b.count - a.count);
      const byAgent = Object.values(byAgentMap).sort((a, b) => b.total - a.total);
      const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

      const dates = byDay.map(d => d.date);
      const dateRange = dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : 'N/A';

      return {
        byModel,
        byAgent,
        byDay,
        summary: {
          totalCalls,
          totalModels: byModel.length,
          totalAgents: byAgent.length,
          dateRange,
          days
        }
      };
    } catch (error) {
      console.error('统计模型使用量失败:', error);
      return { byModel: [], byAgent: [], byDay: [], summary: { totalCalls: 0, totalModels: 0, totalAgents: 0, dateRange: 'N/A', days } };
    }
  }

  // 模型使用量统计缓存
  _modelUsageCache = null;
  _modelUsageCacheTime = 0;

  async getModelUsageStats(days = 30) {
    // 缓存 60 秒，避免频繁全量扫描
    const now = Date.now();
    if (this._modelUsageCache && this._modelUsageCacheTime > now - 60000 && this._modelUsageCache.summary.days === days) {
      return this._modelUsageCache;
    }
    const result = await this.collectModelUsageStats(days);
    this._modelUsageCache = result;
    this._modelUsageCacheTime = now;
    return result;
  }

  async recordModelUsage() {
    try {
      // 使用真实统计数据
      const stats = await this.getModelUsageStats(30);
      const timestamp = new Date().toISOString();
      const history = await this._readHistoryFile('models-stats.json');
      history.data = history.data || [];

      // 转换为旧格式兼容 getModelsStats()
      const usage = {};
      for (const m of stats.byModel) {
        const key = `${m.provider}:${m.modelId}`;
        usage[key] = {
          provider: m.provider,
          modelId: m.modelId,
          modelName: m.modelName,
          count: m.count
        };
      }

      history.data.push({ timestamp, usage });
      history.data = this._cleanOldData(history.data);
      history.lastUpdate = timestamp;
      await this._writeHistoryFile('models-stats.json', history);
    } catch (error) {
      console.error('记录模型使用统计失败:', error);
    }
  }

  // 获取模型使用统计
  async getModelsStats() {
    try {
      const history = await this._readHistoryFile('models-stats.json');
      const recentData = (history.data || []).slice(-30); // 最近30次记录
      
      // 聚合使用统计
      const usageMap = {};
      
      recentData.forEach(record => {
        if (record.usage) {
          Object.keys(record.usage).forEach(key => {
            if (!usageMap[key]) {
              usageMap[key] = {
                provider: record.usage[key].provider,
                modelId: record.usage[key].modelId,
                modelName: record.usage[key].modelName,
                count: 0
              };
            }
            usageMap[key].count += record.usage[key].count || 0;
          });
        }
      });

      const models = Object.values(usageMap);
      const total = models.reduce((sum, m) => sum + m.count, 0);

      return {
        labels: models.map(m => m.modelName),
        data: models.map(m => m.count),
        details: models.map(m => ({
          name: m.modelName,
          provider: m.provider,
          count: m.count,
          percentage: total > 0 ? ((m.count / total) * 100).toFixed(1) : 0
        }))
      };
    } catch (error) {
      console.error('获取模型使用统计失败:', error);
      return { labels: [], data: [], details: [] };
    }
  }

  // 记录健康度历史
  async recordHealthHistory() {
    try {
      const health = await this.getHealthStatus();
      const timestamp = new Date().toISOString();

      const history = await this._readHistoryFile('health-history.json');
      history.data = history.data || [];
      history.data.push({
        timestamp,
        score: health.score,
        status: health.status,
        issues: health.issues || []
      });
      
      history.data = this._cleanOldData(history.data);
      history.lastUpdate = timestamp;
      await this._writeHistoryFile('health-history.json', history);
    } catch (error) {
      console.error('记录健康度历史失败:', error);
    }
  }

  // 获取健康度历史
  async getHealthHistory(hours = 24) {
    try {
      const history = await this._readHistoryFile('health-history.json');
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      
      const filtered = (history.data || []).filter(item => {
        const timestamp = new Date(item.timestamp).getTime();
        return timestamp >= cutoffTime;
      });

      return {
        labels: filtered.map(item => {
          const date = new Date(item.timestamp);
          return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }),
        scores: filtered.map(item => item.score || 0),
        statuses: filtered.map(item => item.status || 'unknown')
      };
    } catch (error) {
      console.error('获取健康度历史失败:', error);
      return { labels: [], scores: [], statuses: [] };
    }
  }

  // 获取Agent详细信息（支持配置中和磁盘上发现的agent）
  async getAgentDetails(agentId) {
    try {
      const config = await this.getConfig();
      const configList = (config && config.agents && config.agents.list) ? config.agents.list : [];

      // 先从 agents.list 查，再从 agents.configs 查，最后以磁盘目录兜底
      const agentConfig = configList.find(a => a.id === agentId) || null;
      const cfgExtra = config?.agents?.configs?.[agentId] || {};

      const agentDir = path.join(AGENTS_DIR, agentId);
      const sessionsDir = path.join(agentDir, 'sessions');

      // 确认磁盘上存在 sessions 目录，否则报错
      const sessionsDirStat = await fs.stat(sessionsDir).catch(() => null);
      if (!agentConfig && (!sessionsDirStat || !sessionsDirStat.isDirectory())) {
        throw new Error(`未找到Agent: ${agentId}（配置和磁盘均不存在）`);
      }
      
      // 获取所有会话文件
      const files = await fs.readdir(sessionsDir).catch(() => []);
      const sessionFiles = files.filter(f => 
        f.endsWith('.jsonl') && !f.includes('.deleted.')
      );

      // 统计会话信息
      const sessions = [];
      let totalMessages = 0;
      let lastActivity = null;

      for (const file of sessionFiles) {
        const filePath = path.join(sessionsDir, file);
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats) continue;

        const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
        const lines = content.trim().split('\n').filter(l => l);
        totalMessages += lines.length;

        if (!lastActivity || stats.mtime > lastActivity) {
          lastActivity = stats.mtime;
        }

        // 解析第一条和最后一条消息
        let firstMessage = null;
        let lastMessage = null;
        if (lines.length > 0) {
          try {
            firstMessage = JSON.parse(lines[0]);
            lastMessage = JSON.parse(lines[lines.length - 1]);
          } catch (e) {
            // 忽略解析错误
          }
        }

        sessions.push({
          id: file.replace('.jsonl', ''),
          messageCount: lines.length,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          firstMessage: firstMessage?.content || firstMessage?.text || 'N/A',
          lastMessage: lastMessage?.content || lastMessage?.text || 'N/A'
        });
      }

      // 按更新时间排序
      sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      // 获取Agent状态
      const status = await this.getAgentStatus(agentId, agentDir);

      // 合并信息来源：agentConfig（list）> cfgExtra（configs）> 默认值
      const defaults = config?.agents?.defaults || {};
      const roleMap = {
        'main': '总管理', 'assistant': '助理', 'system-engineer': '系统工程师',
        'health-expert': '健康顾问', 'coder': '程序员', 'designer': '设计师',
        'writer': '文案', 'analyst': '分析师', 'tester': '测试工程师', 'devops': '运维工程师'
      };

      return {
        id: agentId,
        name: agentConfig?.identity?.name || cfgExtra.identity?.name || agentId,
        emoji: agentConfig?.identity?.emoji || cfgExtra.identity?.emoji || '🧩',
        model: agentConfig?.model?.primary || cfgExtra.model?.primary || defaults.model?.primary || 'N/A',
        workspace: agentConfig?.workspace || cfgExtra.workspace || defaults.workspace || 'N/A',
        subagents: agentConfig?.subagents?.allowAgents || [],
        status: status.status,
        sessionCount: status.sessionCount,
        totalMessages,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        sessions: sessions.slice(0, 50), // 子agent可能会话多，放宽到50个
        _discoveredFromDisk: !agentConfig,
        config: {
          systemPrompt: agentConfig?.systemPrompt || cfgExtra.systemPrompt || defaults.systemPrompt || 'N/A',
          temperature: agentConfig?.model?.temperature || cfgExtra.model?.temperature || defaults.model?.temperature || 'N/A',
          maxTokens: agentConfig?.model?.maxTokens || cfgExtra.model?.maxTokens || defaults.model?.maxTokens || 'N/A'
        }
      };
    } catch (error) {
      console.error('获取Agent详情失败:', error);
      throw error;
    }
  }

  // 获取会话详细信息
  async getSessionDetails(agentId, sessionId) {
    try {
      const sessionFile = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionId}.jsonl`);
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      
      // 获取 agent 配置信息
      let agentName = agentId;
      let agentEmoji = '🤖';
      let agentRole = '助手';
      try {
        const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf-8'));
        const agentConfig = config.agents?.configs?.[agentId] || {};
        agentName = agentConfig.identity?.name || agentId;
        agentEmoji = agentConfig.identity?.emoji || '🤖';
        
        // 角色映射
        const roleMap = {
          'main': '总管理', 'assistant': '助理', 'system-engineer': '系统工程师',
          'health-expert': '健康顾问', 'coder': '程序员', 'designer': '设计师',
          'writer': '文案', 'analyst': '分析师', 'tester': '测试工程师', 'devops': '运维工程师'
        };
        agentRole = agentConfig.identity?.role || roleMap[agentId] || '助手';
      } catch (e) {
        // 使用默认值
      }
      
      const messages = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // 提取消息内容
          if (entry.type === 'message' && entry.message) {
            const msg = entry.message;
            let content = '';
            
            // 处理不同格式的 content
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else if (Array.isArray(msg.content)) {
              content = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
            }
            
            // 根据角色设置发送者名称
            let senderName = msg.role || 'unknown';
            let senderEmoji = '💬';
            if (msg.role === 'user') {
              senderName = '用户';
              senderEmoji = '👤';
            } else if (msg.role === 'assistant') {
              senderName = `${agentName} (${agentRole})`;
              senderEmoji = agentEmoji;
            } else if (msg.role === 'system') {
              senderName = '系统';
              senderEmoji = '⚙️';
            }
            
            messages.push({
              role: msg.role || 'unknown',
              senderName: senderName,
              senderEmoji: senderEmoji,
              content: content,
              timestamp: entry.timestamp
            });
          } else if (entry.type === 'session') {
            messages.push({
              role: 'system',
              senderName: '系统',
              senderEmoji: '🚀',
              content: `会话开始 (版本: ${entry.version}, 工作目录: ${entry.cwd})`,
              timestamp: entry.timestamp
            });
          } else if (entry.type === 'model_change') {
            messages.push({
              role: 'system',
              senderName: '系统',
              senderEmoji: '🔄',
              content: `切换模型: ${entry.provider}/${entry.modelId}`,
              timestamp: entry.timestamp
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
      
      return {
        sessionId,
        agentId,
        agentName,
        agentEmoji,
        agentRole,
        messageCount: messages.length,
        messages
      };
    } catch (error) {
      console.error('获取会话详情失败:', error);
      throw error;
    }
  }

  // 获取任务详细信息
  async getTaskDetails(taskId) {
    try {
      const agents = await this.getAgentsList();
      
      // 在所有Agent的会话目录中查找任务
      for (const agent of agents) {
        const sessionsDir = path.join(AGENTS_DIR, agent.id, 'sessions');
        const filePath = path.join(sessionsDir, `${taskId}.jsonl`);
        
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l);

          // 获取 agent 配置用于显示发送者名称
          let agentDisplayName = agent.name || agent.id;
          let agentEmoji = agent.emoji || '🤖';
          let agentRole = agent.role || '助手';
          
          // 尝试从 jsonl 中解析出用户的真实名字（从 session 入口或消息元数据）
          let userName = '用户';

          // 解析所有消息（与 getSessionDetails 保持一致的解析逻辑）
          const messages = [];
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              if (entry.type === 'message' && entry.message) {
                const msg = entry.message;
                let content = '';

                // 处理不同格式的 content
                if (typeof msg.content === 'string') {
                  content = msg.content;
                } else if (Array.isArray(msg.content)) {
                  content = msg.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                }

                // 根据角色设置发送者名称
                let senderName = msg.role || 'unknown';
                let senderEmoji = '💬';
                if (msg.role === 'user') {
                  // 尝试从消息元数据中获取用户名
                  senderName = msg.senderName || msg.name || userName;
                  senderEmoji = '👤';
                } else if (msg.role === 'assistant') {
                  senderName = `${agentDisplayName} (${agentRole})`;
                  senderEmoji = agentEmoji;
                } else if (msg.role === 'system') {
                  senderName = '系统';
                  senderEmoji = '⚙️';
                }

                messages.push({
                  timestamp: entry.timestamp || new Date().toISOString(),
                  role: msg.role || 'unknown',
                  senderName: senderName,
                  senderEmoji: senderEmoji,
                  content: content,
                  type: 'message'
                });
              } else if (entry.type === 'session') {
                messages.push({
                  timestamp: entry.timestamp || new Date().toISOString(),
                  role: 'system',
                  senderName: '系统',
                  senderEmoji: '🚀',
                  content: `会话开始 (版本: ${entry.version || 'N/A'}, 工作目录: ${entry.cwd || 'N/A'})`,
                  type: 'session'
                });
              } else if (entry.type === 'model_change') {
                messages.push({
                  timestamp: entry.timestamp || new Date().toISOString(),
                  role: 'system',
                  senderName: '系统',
                  senderEmoji: '🔄',
                  content: `切换模型: ${entry.provider || ''}/${entry.modelId || ''}`,
                  type: 'model_change'
                });
              } else {
                // 兜底：尝试从顶层字段提取
                const content = entry.content || entry.text || entry.message?.content || '';
                if (content) {
                  messages.push({
                    timestamp: entry.timestamp || new Date().toISOString(),
                    role: entry.role || 'unknown',
                    senderName: entry.role || 'unknown',
                    senderEmoji: '💬',
                    content: content,
                    type: entry.type || 'text'
                  });
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }

          // 提取任务标题：从用户消息中智能提取关键信息
          let title = '(无标题)';
          for (const m of messages) {
            if (m.role === 'user' && m.content && m.content.trim()) {
              const extracted = this._extractTaskTitle(m.content);
              if (extracted && extracted !== '(无标题)') {
                title = extracted;
                break;
              }
            }
          }

          // 计算任务统计信息
          const startTime = stats.birthtime;
          const endTime = stats.mtime;
          const duration = endTime.getTime() - startTime.getTime();
          const durationMinutes = Math.floor(duration / 60000);
          const durationSeconds = Math.floor((duration % 60000) / 1000);

          return {
            id: taskId,
            agentId: agent.id,
            agentName: agent.name,
            title: title,
            status: 'completed',
            messageCount: messages.length,
            createdAt: startTime.toISOString(),
            completedAt: endTime.toISOString(),
            duration: `${durationMinutes}分${durationSeconds}秒`,
            durationMs: duration,
            messages,
            summary: {
              userMessages: messages.filter(m => m.role === 'user').length,
              assistantMessages: messages.filter(m => m.role === 'assistant').length,
              systemMessages: messages.filter(m => m.role === 'system').length
            }
          };
        } catch (error) {
          // 文件不存在，继续查找下一个Agent
          continue;
        }
      }

      throw new Error(`未找到任务: ${taskId}`);
    } catch (error) {
      console.error('获取任务详情失败:', error);
      throw error;
    }
  }
}

module.exports = DataCollector;
