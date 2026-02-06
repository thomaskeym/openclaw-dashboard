#!/usr/bin/env node
/**
 * 直接测试 Minimax Coding Plan 余额查询 API
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function getApiKey() {
  const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const content = await fs.readFile(configFile, 'utf-8');
  const config = JSON.parse(content);
  return config.models?.providers?.['minimax-coding']?.apiKey;
}

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    console.log(`请求 URL: ${url}`);
    console.log(`请求方法: ${requestOptions.method}`);
    console.log(`请求头:`, JSON.stringify(requestOptions.headers, null, 2));

    const req = https.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n响应状态码: ${res.statusCode}`);
        console.log(`响应头:`, JSON.stringify(res.headers, null, 2));
        console.log(`响应体: ${data}`);
        
        try {
          const jsonData = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: jsonData });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`请求错误:`, error.message);
      console.error(`错误代码:`, error.code);
      reject(error);
    });

    req.setTimeout(15000, () => {
      console.error(`请求超时`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testMinimaxApi() {
  console.log('='.repeat(60));
  console.log('测试 Minimax Coding Plan 余额查询 API');
  console.log('='.repeat(60));
  
  try {
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      console.error('❌ 未找到 minimax-coding 的 API Key');
      return;
    }
    
    console.log(`\nAPI Key: ${apiKey.substring(0, 30)}...`);
    console.log('');
    
    const url = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
    
    const response = await httpRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (response.statusCode === 200) {
      console.log('✅ API 调用成功！');
      console.log('\n解析数据:');
      
      const data = response.data;
      // 数据在 model_remains 数组中
      const modelRemains = data.model_remains && data.model_remains[0];
      
      if (modelRemains) {
        console.log(`  model_name: ${modelRemains.model_name}`);
        console.log(`  remains_time: ${modelRemains.remains_time} (剩余时间，毫秒)`);
        console.log(`  current_interval_total_count: ${modelRemains.current_interval_total_count} (总配额)`);
        console.log(`  current_interval_usage_count: ${modelRemains.current_interval_usage_count} (已使用)`);
        
        if (modelRemains.remains_time) {
          const hours = Math.floor(modelRemains.remains_time / (1000 * 60 * 60));
          const minutes = Math.floor((modelRemains.remains_time % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`\n  剩余时间: ${hours}小时 ${minutes}分钟`);
        }
        
        const total = modelRemains.current_interval_total_count || 0;
        const used = modelRemains.current_interval_usage_count || 0;
        const remaining = total - used;
        
        console.log(`\n  配额使用情况: ${used} / ${total} (剩余: ${remaining})`);
      } else {
        console.log('⚠️ 响应中没有 model_remains 数据');
        console.log('原始数据:', JSON.stringify(data, null, 2));
      }
    } else {
      console.log(`❌ API 返回错误状态码: ${response.statusCode}`);
      console.log('响应数据:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('DNS 解析失败，无法访问 www.minimaxi.com');
      console.error('请检查网络连接或 DNS 设置');
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

testMinimaxApi();
