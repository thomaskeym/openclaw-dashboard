#!/usr/bin/env node
/**
 * 简单测试 API 返回的数据
 */

const http = require('http');

function testAPI() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/api/models/quota', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function run() {
  try {
    console.log('测试 /api/models/quota 接口...\n');
    const models = await testAPI();
    
    console.log(`返回了 ${models.length} 个模型:\n`);
    models.forEach((m, i) => {
      console.log(`${i + 1}. ${m.provider} - ${m.name}`);
      console.log(`   quotaUsed: ${m.quotaUsed} (${typeof m.quotaUsed})`);
      console.log(`   quotaTotal: ${m.quotaTotal} (${typeof m.quotaTotal})`);
      console.log('');
    });
    
    // 检查哪些提供商有配额
    const providersWithQuota = models.filter(m => m.quotaTotal > 0);
    if (providersWithQuota.length > 0) {
      console.log('✅ 有配额的提供商:');
      providersWithQuota.forEach(m => {
        console.log(`  ${m.provider}: ${m.quotaTotal}`);
      });
    } else {
      console.log('❌ 所有提供商的配额都是 0');
    }
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('无法连接到服务器，请确保服务器正在运行 (npm start)');
    }
  }
}

run();
