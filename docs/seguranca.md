# Segurança e proteção de dados

## Controles deste projeto

- bcryptjs com custo 12 em todos os hashes de senha.
- Verificação de pelo menos três das quatro classes de senha, extensão mínima, nome e exemplos mais óbvios.
- Access JWT curto e refresh JWT armazenado no banco somente como SHA-256, em cookie HttpOnly, SameSite Strict e Secure em produção.
- Rotação do token refresh e bloqueio de reutilização após a rotação.
- Zod valida inscrições, credenciais, pesquisa, paginação e tipos de upload.
- Limitação de tentativas de login e de inscrições por IP.
- Helmet, CORS com lista de origem explícita, limite do corpo JSON, rotas RBAC e remoção do cabeçalho `X-Powered-By`.
- Presigned uploads só para JPG, PNG e PDF, vinculados a um Content-Type, com validade de 5 minutos e limite de 5 MB conferido via HEAD no R2.
- Cookies refresh com rotação, alteração de senha e verificação do histórico hasheado de oito senhas anteriores.
- Arquivos servidos somente pelo bucket privado; credenciais ficam no servidor.
- Exclusões lógicas de usuários; limpeza de dados de demonstração só com confirmação.
- Eventos importantes são registrados em uma coleção append-only pela aplicação.

## Limitações e próximos passos obrigatórios

1. Implementar os modelos especializados restantes, APIs completas e segregação por turma em **cada operação**, incluindo edição, exportação e download. O esqueleto cria modelos de domínio compartilhados, e a API atual limita deliberadamente os endpoints implementados.
2. Criar integração do download com presigned GET curto e verificação de permissão por turma/estudante.
3. Consolidar testes de autenticação, proteção contra IDOR, upload, contenção de dados de seed, rotação de refresh, RBAC, XSS, exportação e auditoria.
4. Criar recuperação segura de senha, MFA opcional, histórico de oito senhas em uma rotina de alteração e monitoramento operacional.
5. Avaliar criptografia de telefone e endereço em repouso, política de rotação de chaves, TLS do MongoDB, backups e retenção.
6. Confirmar os cabeçalhos TLS e CORS do bucket em todos os ambientes, restringir a origem e limitar métodos/headers de upload. O limitador de autenticação atual usa armazenamento em memória por processo; adote um armazenamento distribuído antes do deploy com múltiplas instâncias. Verificar controles de NoSQL injection, CSRF, XSS, proxy, limites e acesso dos operadores antes do uso público.
7. Implantar histórico versionado dos termos e políticas, retenção com prazos, direitos de acesso/correção/eliminação/portabilidade e processo de atendimento LGPD.

## Auditoria e retenção

Os controladores registram as ações relevantes via `AuditLog`; o schema bloqueia atualização e remoção pelas APIs Mongoose em memória. **Esse hook não substitui restrição de acesso no banco** e não torna a coleção imutável perante operações administrativas MongoDB. O acesso às coleções deve ser restrito a uma credencial de escrita sem privilégios de alteração/exclusão. Defina retenção, armazenamento append-only e auditoria externa com o responsável.

Consulte [inventário de dados](./inventario-dados.md), [matriz de permissões](./matriz-permissoes.md), [integrações](./apis.md) e [resposta a incidentes](./incidentes.md).
