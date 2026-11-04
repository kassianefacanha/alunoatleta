import assert from 'node:assert/strict';
import test from 'node:test';
import { getSecurityConfigurationIssues, type SecurityConfiguration } from './securityRules.js';

const productionConfig: SecurityConfiguration = {
  nodeEnv: 'production',
  jwtAccessSecret: 'a'.repeat(48),
  jwtRefreshSecret: 'b'.repeat(48),
  frontendOrigin: 'https://alunoatleta.example',
  mongodbUri: 'mongodb+srv://database.example/alunoatleta',
  r2AccessKeyId: 'access-key',
  r2SecretAccessKey: 'secret-key',
  r2AccountId: 'account-id',
  r2Endpoint: 'https://account-id.r2.cloudflarestorage.com'
};

test('aceita configuração de produção com segredos e transportes seguros', () => {
  assert.deepEqual(getSecurityConfigurationIssues(productionConfig), []);
});

test('rejeita segredos JWT compartilhados', () => {
  const issues = getSecurityConfigurationIssues({
    ...productionConfig,
    jwtRefreshSecret: productionConfig.jwtAccessSecret
  });
  assert.ok(issues.some((issue) => issue.path === 'jwtRefreshSecret'));
});

test('rejeita transportes e credenciais inseguros em produção', () => {
  const issues = getSecurityConfigurationIssues({
    ...productionConfig,
    frontendOrigin: 'http://alunoatleta.example',
    mongodbUri: 'mongodb://database.example/alunoatleta',
    r2AccessKeyId: undefined,
    r2Endpoint: 'http://storage.example'
  });
  assert.deepEqual(
    issues.map((issue) => issue.path).sort(),
    ['frontendOrigin', 'mongodbUri', 'r2AccessKeyId', 'r2Endpoint']
  );
});

test('ambiente não produtivo exige segredos JWT distintos, sem impor infraestrutura de produção', () => {
  const issues = getSecurityConfigurationIssues({
    ...productionConfig,
    nodeEnv: 'development',
    jwtRefreshSecret: productionConfig.jwtAccessSecret,
    frontendOrigin: 'http://localhost:3000',
    mongodbUri: 'mongodb://127.0.0.1:27017/alunoatleta',
    r2AccessKeyId: undefined,
    r2SecretAccessKey: undefined,
    r2AccountId: undefined,
    r2Endpoint: undefined
  });
  assert.deepEqual(issues.map((issue) => issue.path), ['jwtRefreshSecret']);
});
