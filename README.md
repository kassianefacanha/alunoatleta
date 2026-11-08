# Aluno / Atleta

Aplicação de educação e esporte inspirada nas referências de login, inscrição e página inicial fornecidas no PDF. A identidade preserva o cartão branco, o logotipo centralizado na área de acesso, os tons de azul, bastante espaço em branco e a navegação discreta; a página inicial e o formulário adaptam a mesma identidade para celular e desktop. A logo da aplicação também aparece no ícone da aba.

## Requisitos

- Node.js 20.19+ ou 22.12+ e npm.
- MongoDB em execução, para cadastrar e autenticar usuários.
- Conta Cloudflare R2, para anexar fotos e fichas.
- Windows PowerShell, para regenerar os PNGs da marca.

## Rodar localmente

1. Copie `backend/.env.example` para `backend/.env` e gere dois valores secretos diferentes com pelo menos 32 caracteres para `JWT_SECRET` e `JWT_REFRESH_SECRET`. Para manter a configuração local anterior, o backend também carrega variáveis de `.env` na raiz. Para apontar o frontend a uma API fora do proxy local, copie `frontend/.env.example` para `frontend/.env` e configure `VITE_API_URL`.
2. Configure `MONGODB_URI`, `CLIENT_ORIGIN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` e o bucket. Sem essas configurações, o servidor informa o problema: não apresenta um cadastro como concluído sem salvar os anexos.
3. Execute `npm install`.
4. Inicie o servidor MongoDB e execute `npm run server` em um terminal.
5. Execute `npm run dev` em outro e abra `http://localhost:5173`.

O cliente encaminha `/api` ao servidor local. Para outra origem, configure `VITE_API_URL` no ambiente de build do Vite. O servidor só inicia com MongoDB e segredos válidos; funcionalidades indisponíveis são indicadas explicitamente.

## Imagens de marca e ícone da aba

- `frontend/public/logo-aluno-atleta.png`: wordmark em PNG, usado na navegação, no login e no cadastro.
- `frontend/public/projeto-aluno-atleta-banner.svg`: ilustração local da marca e dos apoiadores, com o banner do projeto em destaque na capa.
- `frontend/public/favicon.png`: marca do projeto usada na aba do navegador e como ícone de atalho.
- `frontend/public/ficha-inscricao.pdf`: ficha imprimível para assinatura do responsável.
- `scripts/generate-brand-assets.ps1`: fonte regenerável dos PNGs. Execute `npm run assets:brand`.
- `scripts/generate-registration-form.js`: fonte da ficha imprimível. Execute `npm run assets:registration-form`.

## Estrutura

- `frontend/src/components/`: elementos atômicos de UI compartilhados, como marca e rótulos.
- `frontend/src/views/`: páginas públicas, login, inscrição e status.
- `frontend/src/routes/`: mapeamento de rotas públicas.
- `frontend/src/services/`: chamadas HTTP e integrações.
- `frontend/public/`: imagens de marca, ícone da aba e ficha de inscrição.
- `frontend/package.json`: dependências e comandos exclusivos do cliente web.
- `backend/src/models/`: esquemas Mongoose e catálogo de domínios.
- `backend/src/routes/`: rotas HTTP versionadas.
- `backend/src/middleware/`: autenticação e autorização RBAC.
- `backend/src/services/`: senhas, auditoria e URLs de armazenamento.
- `backend/src/seed/`: dados de demonstração e limpeza explícita.
- `backend/package.json`: dependências e comandos exclusivos da API.
- `backend/.env.example`: exemplo de configuração do backend.
- `package.json`: workspaces e comandos que orquestram frontend e backend.
- `docs/`: inventário de dados, permissões, API, segurança e incidentes.

**Nomenclatura:** páginas e componentes React usam `PascalCase`; funções, propriedades e serviços usam `camelCase`; nomes de URL usam minúsculas e hífens. Mantenha elementos visuais reutilizáveis em `components`, páginas compostas em `views`, lógica de HTTP em `services` e acesso ao MongoDB somente a partir do backend.

## Seed de demonstração

Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEACHER_EMAIL`, `TEACHER_PASSWORD`, `TEST_STUDENT_EMAIL` e `TEST_STUDENT_PASSWORD` no ambiente do backend. Na primeira inicialização, a API cria a conta ADM se ainda não houver uma e cria as contas de demonstração de professor e aluno se ainda não existirem. Para compatibilidade com a versão legada, se `ADMIN_EMAIL` corresponder a uma conta ativa com `role: "admin"`, a API migra esse registro para `role: "ADM"`, preenche o nome se estiver ausente e invalida a sessão antiga, preservando o hash da senha. As contas de demonstração são marcadas como `isTestData`, aparecem apenas para o ADM nas listagens de alunos e professores, não podem entrar no sistema nem ser associadas a turmas reais. Use e-mails distintos e senhas exclusivas com pelo menos 12 caracteres. O cadastro é idempotente: reiniciar a API não redefine senhas nem duplica contas. Se um endereço já estiver ligado a outro perfil ou a uma conta desativada, o backend interrompe a inicialização com erro explícito, sem alterar a conta existente.

O comando `npm run seed` permanece destinado a dados locais de demonstração e não roda em produção. Ele cria um ADM, dois professores e **nove** alunos (seis aprovados, dois pendentes e um recusado), três turmas e exemplos de tarefas, materiais, presença, aula, evento e avaliação.

Os registros criados pela seed são marcados `isTestData`; as contas de demonstração de professor e aluno não podem entrar no sistema e não aparecem para professores ou alunos. Execute `npm run seed:clear` somente depois de definir `SEED_CLEAR_CONFIRM=yes`; a operação é bloqueada em produção e exclui somente registros de teste. Os esquemas ainda não aplicam o filtro a todas as entidades ou a todas as rotas futuras. Não utilize dados pessoais reais como dados de demonstração.

Para recriar um banco local com dados variados dos três perfis, use `npm run seed:demo-reset` para ver o alvo e as contagens sem alterar nada. A aplicação exige `npm run seed:demo-reset -- --apply --confirm-database <nome-exato-do-banco>`. Esse comando só aceita MongoDB local, é bloqueado em produção, preserva as contas de `ADMIN_EMAIL`, `TEACHER_EMAIL` e `TEST_STUDENT_EMAIL` e apaga os demais documentos antes de popular. Os registros visíveis para professor/aluno são separados dos registros `isTestData`, exclusivos do ADM. Contas sintéticas adicionais usam a senha de `TEST_STUDENT_PASSWORD`. Arquivos de upload não são criados: precisam existir de verdade no R2. Nunca execute em banco com dados reais.

## Testes e builds

- `npm run build`: verificação TypeScript e bundle de produção do frontend.
- `npm run server:build`: verificação e compilação de TypeScript da API.
- `npm run server`: API local com reload.
- `npm run preview`: preview do bundle local.

Não há testes de integração configurados ainda. A autenticação, os uploads e os painéis de gestão precisam de testes automatizados antes de um deploy com contas reais.

### CORS do bucket R2

Configure o CORS do bucket antes de usar inscrições e substitua o domínio de exemplo pelo domínio efetivo da aplicação:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://seu-projeto.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Deploy

#### Render (API)

Crie um Web Service conectado ao repositório e use o Blueprint de `render.yaml` (ou configure os mesmos valores manualmente):

- Build: `npm ci && npm run server:build`
- Start: `npm run server:start`
- Health check: `/api/v1/health`

Configure `MONGODB_URI` com a conexão TLS do MongoDB Atlas; `JWT_SECRET` e `JWT_REFRESH_SECRET` devem ser segredos distintos (o Blueprint os gera); `CLIENT_ORIGIN` deve ser a origem HTTPS exata do site publicado; e `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_ENDPOINT` para habilitar uploads. Mantenha as credenciais fora do repositório. No Atlas, permita conexões de saída do Render conforme a configuração de rede do seu plano.

#### Vercel (site)

Crie um projeto apontando para a raiz do repositório (`.`), não para `frontend`:

- Build command: `npm run build`
- Output directory: `frontend/dist`
- Install command: `npm ci`
- Variável de produção `VITE_API_URL`: `https://<dominio-da-api>/api/v1`

O arquivo raiz `vercel.json` configura as rotas do app e os cabeçalhos. Faça um novo deploy após alterar variáveis de ambiente.

#### Domínios, login e uploads

Para que os cookies de sessão `SameSite=Strict` funcionem, use domínios próprios sob o mesmo domínio base e com HTTPS, por exemplo `app.seudominio.com` para a Vercel e `api.seudominio.com` para o Render. Defina `CLIENT_ORIGIN` com `https://app.seudominio.com`; use a URL completa da API em `VITE_API_URL`. Os domínios padrão `*.vercel.app` e `*.onrender.com` são sites diferentes e podem impedir a sessão de funcionar.

No CORS do bucket R2, permita o domínio exato do site e os métodos/cabeçalhos necessários aos uploads (veja o exemplo na seção “CORS do bucket R2”). A API precisa das quatro variáveis R2 acima para uploads; não as configure na Vercel.

Antes de liberar o sistema para uso real, ainda é necessário definir e executar a criação segura do primeiro usuário ADM: a seed disponível é apenas para demonstração e não roda em produção. Não use dados reais até validar autenticação, uploads, backups e os fluxos pendentes descritos em “Segurança e privacidade”.

## Segurança e privacidade

As evidências e as limitações de implementação estão em `docs/seguranca.md` e nas demais referências de [`docs/`](./docs/). A aplicação usa hash bcrypt com fator 12, cookies refresh HttpOnly com rotação, validação Zod, limitador de autenticação, autorização de rotas, presigned URLs privados de curta duração, dados de acesso de teste segregados nas listagens e registros de auditoria. As credenciais do R2 permanecem no servidor.

**Escopo atual:** o painel ADM oferece indicadores e análise de inscrições, gestão de professores, modalidades e turmas, solicitações de recuperação de senha e um gerador de relatórios com seleção de conjuntos de dados, colunas, filtros e exportação CSV, Excel ou PDF. O ADM pode redefinir senhas de alunos e professores; a recuperação pública não altera senhas automaticamente e requer confirmação de identidade pela equipe. As modalidades cadastradas exibem ícone e cor escolhidos pela administração no site. A API protege essas operações com autorização ADM, registra exportações e alterações de senha na auditoria e impede remover turmas ou modalidades com vínculos existentes. Painéis completos de professor/aluno, frequência operacional, demais fluxos de gestão e solicitações LGPD ainda precisam ser implementados antes de operar o projeto com pessoas reais. A base não representa, por si só, conformidade integral com a LGPD; revise `docs/seguranca.md` e valide bases legais, retenção e fornecedores com o responsável por proteção de dados.

## Contribuição

1. Confirme se há uma camada correta antes de adicionar um componente.
2. Extraia os elementos visuais reutilizados em `frontend/src/components/`.
3. Mantenha lógica de API fora dos componentes de UI.
4. Não envie arquivos `.env`, dados de alunos, fichas ou credenciais ao repositório.
5. Use mensagens de commit no padrão Conventional Commits (`feat:`, `fix:`, `docs:`).
6. Rode os dois builds de TypeScript antes de propor alterações.
