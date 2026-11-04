export interface SecurityConfiguration {
  nodeEnv: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  frontendOrigin: string;
  mongodbUri: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2AccountId?: string;
  r2Endpoint?: string;
}

export interface SecurityConfigurationIssue {
  path: keyof SecurityConfiguration;
  message: string;
}

export function getSecurityConfigurationIssues(config: SecurityConfiguration): SecurityConfigurationIssue[] {
  const issues: SecurityConfigurationIssue[] = [];
  if (config.jwtAccessSecret === config.jwtRefreshSecret) {
    issues.push({
      path: 'jwtRefreshSecret',
      message: 'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.'
    });
  }
  if (config.nodeEnv !== 'production') return issues;

  if (new URL(config.frontendOrigin).protocol !== 'https:') {
    issues.push({ path: 'frontendOrigin', message: 'FRONTEND_ORIGIN deve usar HTTPS em produção.' });
  }
  const mongoTlsEnabled = /^mongodb\+srv:\/\//i.test(config.mongodbUri) ||
    /(?:[?&])(?:tls|ssl)=(?:true|1)(?:&|$)/i.test(config.mongodbUri);
  if (!mongoTlsEnabled) {
    issues.push({
      path: 'mongodbUri',
      message: 'MONGODB_URI deve usar mongodb+srv ou habilitar TLS em produção.'
    });
  }
  if (!config.r2AccessKeyId || !config.r2SecretAccessKey || (!config.r2AccountId && !config.r2Endpoint)) {
    issues.push({
      path: 'r2AccessKeyId',
      message: 'Configure credenciais R2 completas e R2_ACCOUNT_ID ou R2_ENDPOINT em produção.'
    });
  }
  if (config.r2Endpoint && new URL(config.r2Endpoint).protocol !== 'https:') {
    issues.push({ path: 'r2Endpoint', message: 'R2_ENDPOINT deve usar HTTPS em produção.' });
  }
  return issues;
}
