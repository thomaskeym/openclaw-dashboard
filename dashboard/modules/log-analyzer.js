/**
 * 日志分析工具模块
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw');
const LOGS_DIR = path.join(OPENCLAW_HOME, 'logs');

class LogAnalyzer {
  constructor() {
    this.logCache = null;
    this.cacheTime = null;
    this.cacheTimeout = 5000; // 5秒缓存
  }

  // 分析日志
  async analyzeLogs(options = {}) {
    const {
      hours = 24,
      level = 'all',
      keyword = ''
    } = options;

    try {
      const logFile = path.join(LOGS_DIR, 'gateway.err.log');
      const stats = await fs.stat(logFile).catch(() => null);
      if (!stats) {
        return {
          total: 0,
          byLevel: {},
          byHour: {},
          errors: [],
          patterns: []
        };
      }

      // 读取日志文件
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      const filteredLines = [];

      for (const line of lines) {
        // 提取时间戳
        const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
        if (timestampMatch) {
          const timestamp = new Date(timestampMatch[1]).getTime();
          if (timestamp >= cutoffTime) {
            filteredLines.push(line);
          }
        } else {
          // 没有时间戳的行，也包含进来
          filteredLines.push(line);
        }
      }

      // 分析日志
      const analysis = {
        total: filteredLines.length,
        byLevel: {},
        byHour: {},
        errors: [],
        warnings: [],
        patterns: []
      };

      // 按级别统计
      filteredLines.forEach(line => {
        let logLevel = 'info';
        if (line.toLowerCase().includes('error')) logLevel = 'error';
        else if (line.toLowerCase().includes('warn')) logLevel = 'warn';
        
        analysis.byLevel[logLevel] = (analysis.byLevel[logLevel] || 0) + 1;

        // 提取小时
        const hourMatch = line.match(/T(\d{2}):/);
        if (hourMatch) {
          const hour = hourMatch[1];
          analysis.byHour[hour] = (analysis.byHour[hour] || 0) + 1;
        }

        // 收集错误和警告
        if (logLevel === 'error') {
          analysis.errors.push({
            line,
            timestamp: this.extractTimestamp(line)
          });
        } else if (logLevel === 'warn') {
          analysis.warnings.push({
            line,
            timestamp: this.extractTimestamp(line)
          });
        }
      });

      // 识别错误模式
      analysis.patterns = this.identifyPatterns(analysis.errors);

      // 应用过滤
      if (level !== 'all') {
        analysis.errors = analysis.errors.filter(e => 
          level === 'error' || (level === 'warn' && e.line.toLowerCase().includes('warn'))
        );
      }

      if (keyword) {
        const keywordLower = keyword.toLowerCase();
        analysis.errors = analysis.errors.filter(e => 
          e.line.toLowerCase().includes(keywordLower)
        );
        analysis.warnings = analysis.warnings.filter(w => 
          w.line.toLowerCase().includes(keywordLower)
        );
      }

      return analysis;
    } catch (error) {
      console.error('分析日志失败:', error);
      throw error;
    }
  }

  // 提取时间戳
  extractTimestamp(line) {
    const match = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
    return match ? match[1] : new Date().toISOString();
  }

  // 识别错误模式
  identifyPatterns(errors) {
    const patterns = {};
    
    errors.forEach(error => {
      // 提取错误关键词
      const errorKeywords = [
        'timeout', 'connection', 'failed', 'error', 'exception',
        'not found', 'permission', 'unauthorized', 'invalid'
      ];

      for (const keyword of errorKeywords) {
        if (error.line.toLowerCase().includes(keyword)) {
          patterns[keyword] = (patterns[keyword] || 0) + 1;
        }
      }
    });

    // 转换为数组并排序
    return Object.entries(patterns)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // 只返回前10个模式
  }

  // 获取错误统计
  async getErrorStats(hours = 24) {
    try {
      const analysis = await this.analyzeLogs({ hours });
      
      return {
        totalErrors: analysis.errors.length,
        totalWarnings: analysis.warnings.length,
        byLevel: analysis.byLevel,
        byHour: analysis.byHour,
        topPatterns: analysis.patterns
      };
    } catch (error) {
      console.error('获取错误统计失败:', error);
      throw error;
    }
  }

  // 获取错误模式
  async getErrorPatterns(hours = 24) {
    try {
      const analysis = await this.analyzeLogs({ hours });
      return analysis.patterns;
    } catch (error) {
      console.error('获取错误模式失败:', error);
      throw error;
    }
  }
}

module.exports = LogAnalyzer;
