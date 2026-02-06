/**
 * 性能基准测试模块
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');
const DataCollector = require('../data-collector');

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw');
const AGENTS_DIR = path.join(OPENCLAW_HOME, 'agents');

class Benchmark {
  constructor() {
    this.isRunning = false;
    this.results = null;
    this.startTime = null;
    this.collector = new DataCollector();
  }

  // 开始性能测试
  async start() {
    if (this.isRunning) {
      throw new Error('基准测试已在运行中');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.results = {
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      tests: []
    };

    try {
      // 执行各项测试
      await Promise.all([
        this.testSystemResources(),
        this.testDataCollection(),
        this.testAgentAccess(),
        this.testTaskProcessing()
      ]);

      this.results.endTime = new Date().toISOString();
      this.results.duration = Date.now() - this.startTime;
    } catch (error) {
      console.error('基准测试失败:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }

    return this.results;
  }

  // 测试系统资源
  async testSystemResources() {
    const start = performance.now();
    
    try {
      const osUtils = require('node-os-utils');
      const [cpuUsage, memInfo] = await Promise.all([
        osUtils.cpu.usage().catch(() => 0),
        osUtils.mem.info().catch(() => ({ totalMemMb: 0, usedMemMb: 0 }))
      ]);

      const duration = performance.now() - start;

      this.results.tests.push({
        name: '系统资源获取',
        duration: duration.toFixed(2),
        success: true,
        metrics: {
          cpu: cpuUsage,
          memory: memInfo.usedMemMb,
          memoryTotal: memInfo.totalMemMb
        }
      });
    } catch (error) {
      this.results.tests.push({
        name: '系统资源获取',
        duration: (performance.now() - start).toFixed(2),
        success: false,
        error: error.message
      });
    }
  }

  // 测试数据采集
  async testDataCollection() {
    const start = performance.now();
    
    try {
      const [system, agents, tasks, channels, health] = await Promise.all([
        this.collector.getSystemOverview(),
        this.collector.getAgentsList(),
        this.collector.getTasks(),
        this.collector.getChannelsStatus(),
        this.collector.getHealthStatus()
      ]);

      const duration = performance.now() - start;

      this.results.tests.push({
        name: '数据采集',
        duration: duration.toFixed(2),
        success: true,
        metrics: {
          agentsCount: agents.length,
          tasksCount: tasks.current.length + tasks.history.length,
          channelsCount: channels.length,
          healthScore: health.score
        }
      });
    } catch (error) {
      this.results.tests.push({
        name: '数据采集',
        duration: (performance.now() - start).toFixed(2),
        success: false,
        error: error.message
      });
    }
  }

  // 测试Agent访问
  async testAgentAccess() {
    const start = performance.now();
    
    try {
      const agents = await this.collector.getAgentsList();
      const accessTimes = [];

      for (const agent of agents.slice(0, 5)) { // 只测试前5个Agent
        const agentStart = performance.now();
        try {
          await this.collector.getAgentStatus(agent.id, path.join(AGENTS_DIR, agent.id));
          accessTimes.push(performance.now() - agentStart);
        } catch (error) {
          // 忽略单个Agent错误
        }
      }

      const avgAccessTime = accessTimes.length > 0
        ? (accessTimes.reduce((a, b) => a + b, 0) / accessTimes.length).toFixed(2)
        : 0;

      const duration = performance.now() - start;

      this.results.tests.push({
        name: 'Agent访问',
        duration: duration.toFixed(2),
        success: true,
        metrics: {
          agentsTested: accessTimes.length,
          avgAccessTime: avgAccessTime,
          totalAgents: agents.length
        }
      });
    } catch (error) {
      this.results.tests.push({
        name: 'Agent访问',
        duration: (performance.now() - start).toFixed(2),
        success: false,
        error: error.message
      });
    }
  }

  // 测试任务处理
  async testTaskProcessing() {
    const start = performance.now();
    
    try {
      const tasks = await this.collector.getTasks();
      const allTasks = [...tasks.current, ...tasks.history].slice(0, 10);
      
      let processedCount = 0;
      const processTimes = [];

      for (const task of allTasks) {
        const taskStart = performance.now();
        try {
          // 尝试获取任务详情（但不实际读取完整内容）
          const agentDir = path.join(AGENTS_DIR, task.agentId, 'sessions');
          const filePath = path.join(agentDir, `${task.id}.jsonl`);
          await fs.access(filePath);
          processTimes.push(performance.now() - taskStart);
          processedCount++;
        } catch (error) {
          // 忽略单个任务错误
        }
      }

      const avgProcessTime = processTimes.length > 0
        ? (processTimes.reduce((a, b) => a + b, 0) / processTimes.length).toFixed(2)
        : 0;

      const duration = performance.now() - start;

      this.results.tests.push({
        name: '任务处理',
        duration: duration.toFixed(2),
        success: true,
        metrics: {
          tasksProcessed: processedCount,
          avgProcessTime: avgProcessTime,
          totalTasks: allTasks.length
        }
      });
    } catch (error) {
      this.results.tests.push({
        name: '任务处理',
        duration: (performance.now() - start).toFixed(2),
        success: false,
        error: error.message
      });
    }
  }

  // 获取测试状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      results: this.results
    };
  }

  // 获取测试结果
  getResults() {
    return this.results;
  }
}

module.exports = Benchmark;
