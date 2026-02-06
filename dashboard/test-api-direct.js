#!/usr/bin/env node
/**
 * 直接测试 API 调用
 * 使用方法: node test-api-direct.js
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// HTTP 请求辅助函数
function httpRequest(url, options = {}) {
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

      console.log(`\n[测试] ${requestOptions.method} ${url}`);
      console.log(`[测试] Headers:`, JSON.stringify(requestOptions.headers, null, 2));

      const req = client.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`[测试] 响应状态码: ${res.statusCode}`);
          console.log(`[测试] 响应头:`, res.headers);
          console.log(`[测试] 响应体:`, data);
          
          try {
            const jsonData = JSON.parse(data);
            resolve({ statusCode: res.statusCode, headers: res.headers, data: jsonData });
          } catch (error) {
            resolve({ statusCode: res.statusCode, headers: res.headers, data: data });
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[测试] 请求错误:`, error.message);
        reject(error);
      });

      req.setTimeout(10000, () => {
        console.error(`[测试] 请求超时`);
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    } catch (error) {
      console.error(`[测试] 创建请求失败:`, error.message);
      reject(error);
    }
  });
}

// 测试 Minimax API
async function testMinimax() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 Minimax Coding 余额查询 API');
  console.log('='.repeat(60));
  
  // 从配置文件读取 API Key
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  
  try {
    const configContent = await fs.readFile(configFile, 'utf-8');
    const config = JSON.parse(configContent);
    
    const minimaxCodingConfig = config.models?.providers?.['minimax-coding'];
    if (!minimaxCodingConfig || !minimaxCodingConfig.apiKey) {
      console.error('未找到 minimax-coding 的 API Key');
      return;
    }
    
    const apiKey = minimaxCodingConfig.apiKey;
    console.log(`使用 API Key: ${apiKey.substring(0, 20)}...`);
    
    const url = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
    const response = await httpRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.statusCode === 200) {
      console.log('\n✅ API 调用成功！');
      console.log('返回数据:', JSON.stringify(response.data, null, 2));
      
      const data = response.data;
      const total = data.current_interval_total_count || 0;
      const used = data.current_interval_usage_count || 0;
      const remaining = total - used;
      
      console.log('\n解析结果:');
      console.log(`  总配额: ${total}`);
      console.log(`  已使用: ${used}`);
      console.log(`  剩余: ${remaining}`);
      if (data.remains_time) {
        const hours = Math.floor(data.remains_time / (1000 * 60 * 60));
        const minutes = Math.floor((data.remains_time % (1000 * 60 * 60)) / (1000 * 60));
        console.log(`  剩余时间: ${hours}小时 ${minutes}分钟`);
      }
    } else {
      console.error(`\n❌ API 返回错误状态码: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('DNS 解析失败，请检查网络连接');
    }
  }
}

// 测试 Moonshot API
async function testMoonshot() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 Moonshot (Kimi) 余额查询 API');
  console.log('='.repeat(60));
  
  // 从配置文件读取 API Key
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  
  try {
    const configContent = await fs.readFile(configFile, 'utf-8');
    const config = JSON.parse(configContent);
    
    // 查找 moonshot 相关的配置
    let moonshotConfig = null;
    let providerName = null;
    
    for (const [name, provider] of Object.entries(config.models?.providers || {})) {
      if (name.includes('moonshot') || name.includes('kimi')) {
        moonshotConfig = provider;
        providerName = name;
        break;
      }
    }
    
    if (!moonshotConfig || !moonshotConfig.apiKey) {
      console.error('未找到 Moonshot 的 API Key');
      return;
    }
    
    const apiKey = moonshotConfig.apiKey;
    console.log(`提供商: ${providerName}`);
    console.log(`使用 API Key: ${apiKey.substring(0, 20)}...`);
    
    // 尝试两个可能的域名
    const urls = [
      'https://api.moonshot.ai/v1/users/me/balance',  // 国际站（官方文档）
      'https://api.moonshot.cn/v1/users/me/balance'   // 中国站
    ];
    
    let success = false;
    for (const url of urls) {
      try {
        console.log(`\n尝试 URL: ${url}`);
        const response = await httpRequest(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.statusCode === 200) {
          console.log('\n✅ API 调用成功！');
          console.log('返回数据:', JSON.stringify(response.data, null, 2));
          
          const data = response.data;
          // 根据官方文档，响应格式为: { code: 0, data: { available_balance: number, ... }, status: true }
          let balance = 0;
          if (data.code === 0 && data.data && typeof data.data.available_balance === 'number') {
            // 官方格式：data.data.available_balance
            balance = data.data.available_balance;
            const voucherBalance = data.data.voucher_balance || 0;
            const cashBalance = data.data.cash_balance || 0;
            
            console.log('\n解析结果:');
            console.log(`  可用余额: ${balance} USD`);
            console.log(`  代金券余额: ${voucherBalance} USD`);
            console.log(`  现金余额: ${cashBalance} USD`);
            success = true;
            break;
          } else {
            // 尝试其他可能的格式
            if (data.data && typeof data.data.available === 'number') {
              balance = data.data.available;
            } else if (typeof data.balance === 'number') {
              balance = data.balance;
            } else if (typeof data.available_balance === 'number') {
              balance = data.available_balance;
            } else if (typeof data.available === 'number') {
              balance = data.available;
            }
            
            if (balance > 0) {
              console.log('\n解析结果（兼容格式）:');
              console.log(`  余额: ${balance}`);
              success = true;
              break;
            }
          }
        } else {
          console.error(`\n❌ API 返回错误状态码: ${response.statusCode}`);
          console.error('响应数据:', response.data);
          // 继续尝试下一个 URL
        }
      } catch (error) {
        console.error(`\n❌ 请求失败 (${url}):`, error.message);
        if (error.code === 'ENOTFOUND') {
          console.error('DNS 解析失败，尝试下一个域名...');
          continue;
        }
      }
    }
    
    if (!success) {
      console.error('\n❌ 所有 Moonshot API 地址都查询失败');
    }
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('DNS 解析失败，请检查网络连接');
    }
  }
}

// 运行所有测试
async function runAllTests() {
  await testMinimax();
  await testMoonshot();
  
  console.log('\n' + '='.repeat(60));
  console.log('所有测试完成');
  console.log('='.repeat(60));
}

runAllTests();
