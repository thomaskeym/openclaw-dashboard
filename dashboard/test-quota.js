#!/usr/bin/env node
/**
 * 手动测试余额查询功能
 * 使用方法: node test-quota.js
 */

const DataCollector = require('./data-collector.js');

async function testQuota() {
  console.log('='.repeat(60));
  console.log('开始测试余额查询功能');
  console.log('='.repeat(60));
  
  const collector = new DataCollector();
  
  try {
    console.log('\n1. 查询所有模型配额...');
    const models = await collector.getModelsQuota();
    
    console.log(`\n找到 ${models.length} 个模型:\n`);
    
    models.forEach((model, index) => {
      console.log(`${index + 1}. ${model.name}`);
      console.log(`   提供商: ${model.provider}`);
      console.log(`   已使用: ${model.quotaUsed}`);
      console.log(`   总配额: ${model.quotaTotal}`);
      console.log(`   剩余: ${model.quotaTotal - model.quotaUsed}`);
      if (model.quotaExtra) {
        console.log(`   额外信息: ${JSON.stringify(model.quotaExtra)}`);
      }
      console.log('');
    });
    
    // 按提供商分组显示
    console.log('\n2. 按提供商分组显示:\n');
    const providerGroups = {};
    models.forEach(model => {
      const provider = model.provider || 'unknown';
      if (!providerGroups[provider]) {
        providerGroups[provider] = {
          provider: provider,
          models: [],
          quotaUsed: model.quotaUsed || 0,
          quotaTotal: model.quotaTotal || 0
        };
      }
      providerGroups[provider].models.push(model.name);
    });
    
    Object.values(providerGroups).forEach(group => {
      console.log(`提供商: ${group.provider}`);
      console.log(`  模型: ${group.models.join(', ')}`);
      console.log(`  配额: ${group.quotaUsed} / ${group.quotaTotal}`);
      console.log(`  剩余: ${group.quotaTotal - group.quotaUsed}`);
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('测试失败:', error);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 运行测试
testQuota();
