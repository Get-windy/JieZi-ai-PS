#!/usr/bin/env node

/**
 * 为主控 Agent 添加飞书通道策略绑定
 */

import http from 'http';

const RPC_URL = 'http://localhost:8080/rpc';

function callRPC(method, params) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(`RPC Error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response.result);
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

async function main() {
  console.log('🔍 正在获取当前主控 Agent 的通道策略配置...\n');

  try {
    // 1. 获取当前配置
    const currentConfig = await callRPC('agent.channelPolicies.get', { agentId: 'main' });
    console.log('✅ 当前配置:', JSON.stringify(currentConfig, null, 2));

    // 2. 创建新的绑定配置
    const newBinding = {
      channelId: 'feishu',
      accountId: 'default',
      policy: {
        type: 'private',
        config: {
          allowedUsers: [] // 空数组表示不限制特定用户，使用默认行为
        }
      },
      enabled: true,
      priority: 1,
      description: '飞书通道 - 私密模式'
    };

    // 3. 构建新配置
    const newConfig = {
      bindings: [newBinding],
      defaultPolicy: {
        type: 'private',
        config: {
          allowedUsers: []
        }
      }
    };

    console.log('\n📝 新配置:', JSON.stringify(newConfig, null, 2));

    // 4. 保存配置
    console.log('\n💾 正在保存配置...');
    const saveResult = await callRPC('agent.channelPolicies.update', {
      agentId: 'main',
      config: newConfig
    });

    console.log('✅ 保存成功:', JSON.stringify(saveResult, null, 2));

    // 5. 重新加载配置以验证
    console.log('\n🔄 重新加载配置进行验证...');
    const verifiedConfig = await callRPC('agent.channelPolicies.get', { agentId: 'main' });
    console.log('✅ 验证后的配置:', JSON.stringify(verifiedConfig, null, 2));

    console.log('\n✨ 完成！飞书通道已成功绑定到主控 Agent。');
    console.log('\n📌 提示：');
    console.log('   - 现在可以在助理管理页面的"通道策略"标签页查看和管理绑定');
    console.log('   - 可以为不同的飞书账号配置不同的策略');
    console.log('   - Private 策略下，可以通过 allowedUsers 限制特定用户访问');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error('请确保 Gateway 服务正在运行（端口 8080）');
    process.exit(1);
  }
}

main();
