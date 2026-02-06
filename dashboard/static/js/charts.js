/**
 * 图表组件模块
 * 使用Chart.js实现各种数据可视化图表
 */

class ChartsManager {
  constructor() {
    this.charts = {};
    this.init();
  }

  init() {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupCharts());
    } else {
      this.setupCharts();
    }
  }

  setupCharts() {
    // 初始化所有图表（通道消息统计图已移除）
    this.initMetricsChart();
    this.initTasksChart();
    this.initModelsChart();
    this.initHealthChart();
  }

  // 销毁图表
  destroyChart(chartId) {
    if (this.charts[chartId]) {
      this.charts[chartId].destroy();
      delete this.charts[chartId];
    }
  }

  // ========== 性能趋势图 ==========
  async initMetricsChart() {
    const canvas = document.getElementById('metricsChartCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('metricsChart');
    if (!container) return;
    
    try {
      const response = await fetch('/api/metrics/history?hours=24');
      if (!response.ok) return;
      const data = await response.json();

      if (this.charts.metrics) {
        this.charts.metrics.destroy();
      }

      this.charts.metrics = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels || [],
          datasets: [
            {
              label: 'CPU使用率 (%)',
              data: data.cpu || [],
              borderColor: 'rgb(239, 68, 68)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.4,
              fill: true,
              yAxisID: 'y'
            },
            {
              label: '内存使用 (MB)',
              data: data.memory || [],
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.4,
              fill: true,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: '性能趋势（最近24小时）',
              font: { size: 14 }
            },
            legend: {
              display: true,
              position: 'top'
            }
          },
          scales: {
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: {
                display: true,
                text: 'CPU (%)'
              },
              min: 0,
              max: 100
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: {
                display: true,
                text: '内存 (MB)'
              },
              grid: {
                drawOnChartArea: false
              }
            }
          }
        }
      });

      container.style.display = 'block';
    } catch (error) {
      console.error('初始化性能趋势图失败:', error);
    }
  }

  async updateMetricsChart() {
    if (!this.charts.metrics) {
      await this.initMetricsChart();
      return;
    }

    try {
      const response = await fetch('/api/metrics/history?hours=24');
      const data = await response.json();

      this.charts.metrics.data.labels = data.labels || [];
      this.charts.metrics.data.datasets[0].data = data.cpu || [];
      this.charts.metrics.data.datasets[1].data = data.memory || [];
      this.charts.metrics.update('none'); // 无动画更新
    } catch (error) {
      console.error('更新性能趋势图失败:', error);
    }
  }

  // ========== 消息统计图 ==========
  async initChannelsChart(range = 'today') {
    const canvas = document.getElementById('channelsChartCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('channelsChart');
    if (!container) return;

    try {
      const response = await fetch(`/api/channels/stats?range=${range}`);
      const data = await response.json();

      if (this.charts.channels) {
        this.charts.channels.destroy();
      }

      this.charts.channels = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.labels || [],
          datasets: [{
            label: '消息数量',
            data: data.data || [],
            backgroundColor: [
              'rgba(59, 130, 246, 0.8)',
              'rgba(16, 185, 129, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(239, 68, 68, 0.8)',
              'rgba(139, 92, 246, 0.8)'
            ],
            borderColor: [
              'rgb(59, 130, 246)',
              'rgb(16, 185, 129)',
              'rgb(245, 158, 11)',
              'rgb(239, 68, 68)',
              'rgb(139, 92, 246)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `通道消息统计（${range === 'today' ? '今日' : range === 'week' ? '本周' : '本月'}）`,
              font: { size: 14 }
            },
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: '消息数量'
              }
            }
          }
        }
      });

      container.style.display = 'block';
    } catch (error) {
      console.error('初始化消息统计图失败:', error);
    }
  }

  async updateChannelsChart(range = 'today') {
    if (!this.charts.channels) {
      await this.initChannelsChart(range);
      return;
    }

    try {
      const response = await fetch(`/api/channels/stats?range=${range}`);
      const data = await response.json();

      this.charts.channels.data.labels = data.labels || [];
      this.charts.channels.data.datasets[0].data = data.data || [];
      this.charts.channels.options.plugins.title.text = `通道消息统计（${range === 'today' ? '今日' : range === 'week' ? '本周' : '本月'}）`;
      this.charts.channels.update();
    } catch (error) {
      console.error('更新消息统计图失败:', error);
    }
  }

  // ========== 任务执行时间分布 ==========
  async initTasksChart() {
    const canvas = document.getElementById('tasksChartCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('tasksChart');
    if (!container) return;

    try {
      const response = await fetch('/api/tasks/stats');
      const data = await response.json();

      if (this.charts.tasks) {
        this.charts.tasks.destroy();
      }

      this.charts.tasks = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.labels || [],
          datasets: [{
            label: '任务数量',
            data: data.data || [],
            backgroundColor: 'rgba(139, 92, 246, 0.8)',
            borderColor: 'rgb(139, 92, 246)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `任务执行时间分布（平均: ${data.average}秒，总计: ${data.total}个）`,
              font: { size: 14 }
            },
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: '任务数量'
              }
            },
            x: {
              title: {
                display: true,
                text: '执行时间区间'
              }
            }
          }
        }
      });

      container.style.display = 'block';
    } catch (error) {
      console.error('初始化任务分布图失败:', error);
    }
  }

  async updateTasksChart() {
    if (!this.charts.tasks) {
      await this.initTasksChart();
      return;
    }

    try {
      const response = await fetch('/api/tasks/stats');
      const data = await response.json();

      this.charts.tasks.data.labels = data.labels || [];
      this.charts.tasks.data.datasets[0].data = data.data || [];
      this.charts.tasks.options.plugins.title.text = `任务执行时间分布（平均: ${data.average}秒，总计: ${data.total}个）`;
      this.charts.tasks.update('none');
    } catch (error) {
      console.error('更新任务分布图失败:', error);
    }
  }

  // ========== 模型使用统计 ==========
  async initModelsChart() {
    const canvas = document.getElementById('modelsChartCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('modelsChart');
    if (!container) return;

    try {
      const response = await fetch('/api/models/stats');
      const data = await response.json();

      if (this.charts.models) {
        this.charts.models.destroy();
      }

      // 如果没有数据，不显示图表
      if (!data.labels || data.labels.length === 0) {
        return;
      }

      this.charts.models = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: data.labels || [],
          datasets: [{
            data: data.data || [],
            backgroundColor: [
              'rgba(59, 130, 246, 0.8)',
              'rgba(16, 185, 129, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(239, 68, 68, 0.8)',
              'rgba(139, 92, 246, 0.8)',
              'rgba(236, 72, 153, 0.8)',
              'rgba(14, 165, 233, 0.8)'
            ],
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: '模型使用统计',
              font: { size: 14 }
            },
            legend: {
              display: true,
              position: 'right'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });

      container.style.display = 'block';
    } catch (error) {
      console.error('初始化模型使用统计图失败:', error);
    }
  }

  async updateModelsChart() {
    if (!this.charts.models) {
      await this.initModelsChart();
      return;
    }

    try {
      const response = await fetch('/api/models/stats');
      const data = await response.json();

      if (!data.labels || data.labels.length === 0) {
        return;
      }

      this.charts.models.data.labels = data.labels || [];
      this.charts.models.data.datasets[0].data = data.data || [];
      this.charts.models.update('none');
    } catch (error) {
      console.error('更新模型使用统计图失败:', error);
    }
  }

  // ========== 健康度趋势 ==========
  async initHealthChart() {
    const canvas = document.getElementById('healthChartCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('healthChart');
    if (!container) return;

    try {
      const response = await fetch('/api/health/history?hours=24');
      const data = await response.json();

      if (this.charts.health) {
        this.charts.health.destroy();
      }

      // 根据状态设置颜色
      const backgroundColors = data.statuses.map(status => {
        if (status === 'healthy') return 'rgba(16, 185, 129, 0.2)';
        if (status === 'warning') return 'rgba(245, 158, 11, 0.2)';
        return 'rgba(239, 68, 68, 0.2)';
      });

      const borderColors = data.statuses.map(status => {
        if (status === 'healthy') return 'rgb(16, 185, 129)';
        if (status === 'warning') return 'rgb(245, 158, 11)';
        return 'rgb(239, 68, 68)';
      });

      this.charts.health = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels || [],
          datasets: [{
            label: '健康度分数',
            data: data.scores || [],
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: borderColors,
            pointBorderColor: borderColors,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: '健康度趋势（最近24小时）',
              font: { size: 14 }
            },
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              title: {
                display: true,
                text: '健康度分数'
              },
              ticks: {
                callback: function(value) {
                  return value + '%';
                }
              }
            }
          }
        }
      });

      container.style.display = 'block';
    } catch (error) {
      console.error('初始化健康度趋势图失败:', error);
    }
  }

  async updateHealthChart() {
    if (!this.charts.health) {
      await this.initHealthChart();
      return;
    }

    try {
      const response = await fetch('/api/health/history?hours=24');
      const data = await response.json();

      this.charts.health.data.labels = data.labels || [];
      this.charts.health.data.datasets[0].data = data.scores || [];
      
      // 更新点颜色
      const borderColors = (data.statuses || []).map(status => {
        if (status === 'healthy') return 'rgb(16, 185, 129)';
        if (status === 'warning') return 'rgb(245, 158, 11)';
        return 'rgb(239, 68, 68)';
      });
      this.charts.health.data.datasets[0].pointBackgroundColor = borderColors;
      this.charts.health.data.datasets[0].pointBorderColor = borderColors;
      
      this.charts.health.update('none');
    } catch (error) {
      console.error('更新健康度趋势图失败:', error);
    }
  }

  // ========== 模型使用量每日趋势图 ==========
  renderModelUsageTrend(data) {
    const canvas = document.getElementById('modelUsageTrendCanvas');
    if (!canvas || !data.byDay || data.byDay.length === 0) return;

    const ctx = canvas.getContext('2d');

    // 销毁旧图表
    if (this.charts.modelUsageTrend) {
      this.charts.modelUsageTrend.destroy();
    }

    const colors = [
      'rgb(59, 130, 246)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)',
      'rgb(239, 68, 68)', 'rgb(139, 92, 246)', 'rgb(236, 72, 153)',
      'rgb(6, 182, 212)', 'rgb(132, 204, 22)', 'rgb(249, 115, 22)', 'rgb(99, 102, 241)'
    ];
    const bgColors = [
      'rgba(59, 130, 246, 0.1)', 'rgba(16, 185, 129, 0.1)', 'rgba(245, 158, 11, 0.1)',
      'rgba(239, 68, 68, 0.1)', 'rgba(139, 92, 246, 0.1)', 'rgba(236, 72, 153, 0.1)',
      'rgba(6, 182, 212, 0.1)', 'rgba(132, 204, 22, 0.1)', 'rgba(249, 115, 22, 0.1)', 'rgba(99, 102, 241, 0.1)'
    ];

    // 获取所有出现过的模型 key（按总量排序，取前6个）
    const modelTotals = {};
    data.byDay.forEach(day => {
      Object.entries(day.counts).forEach(([key, count]) => {
        modelTotals[key] = (modelTotals[key] || 0) + count;
      });
    });
    const topModels = Object.entries(modelTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(e => e[0]);

    // 从 byModel 获取名称映射
    const nameMap = {};
    if (data.byModel) {
      data.byModel.forEach(m => {
        nameMap[`${m.provider}/${m.modelId}`] = m.modelName;
      });
    }

    const labels = data.byDay.map(d => {
      const parts = d.date.split('-');
      return `${parts[1]}/${parts[2]}`;
    });

    const datasets = topModels.map((modelKey, i) => ({
      label: nameMap[modelKey] || modelKey.split('/').pop(),
      data: data.byDay.map(day => day.counts[modelKey] || 0),
      borderColor: colors[i % colors.length],
      backgroundColor: bgColors[i % bgColors.length],
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2
    }));

    this.charts.modelUsageTrend = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              footer: function(tooltipItems) {
                const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
                return `合计: ${total} 次`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              font: { size: 10 },
              callback: function(value) { return Number.isInteger(value) ? value : ''; }
            },
            title: {
              display: true,
              text: '调用次数',
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // 更新所有图表
  async updateAllCharts() {
    await Promise.all([
      this.updateMetricsChart(),
      this.updateTasksChart(),
      this.updateModelsChart(),
      this.updateHealthChart()
    ]);
  }
}

// 创建全局图表管理器实例
window.chartsManager = new ChartsManager();
