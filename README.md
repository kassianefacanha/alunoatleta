# Aluno / Atleta

Aplicação de educação e esporte inspirada nas referências de login, inscrição e página inicial fornecidas no PDF. A identidade preserva o cartão branco, o logotipo centralizado na área de acesso, os tons de azul, bastante espaço em branco e a navegação discreta; a página inicial e o formulário adaptam a mesma identidade para celular e desktop. A logo da aplicação também aparece no ícone da aba.

## Sobre o projeto

O Aluno / Atleta é uma plataforma web de apoio ao projeto de educação e esporte do Alto da Mangueira, em Maracanaú, Ceará. Seu objetivo é aproximar inscrição, organização das turmas e acompanhamento das atividades esportivas e educativas em um único sistema. A aplicação contempla um site público e áreas autenticadas, com interfaces adaptáveis a computador e celular.

O sistema organiza o acesso por perfil:

| Perfil | O que pode fazer |
|---|---|
| Público e responsável | Conhecer o projeto, consultar modalidades, ler os documentos, iniciar uma inscrição e acompanhar as orientações de status. |
| Administração (ADM) | Acompanhar indicadores, revisar inscrições, administrar equipe, modalidades, turmas e vagas, publicar conteúdo, tratar solicitações e consultar relatórios e auditoria. |
| Professor | Acessar as próprias turmas, acompanhar alunos, revisar inscrições vinculadas, registrar frequência, criar atividades e conteúdos, enviar comunicados e acompanhar avaliações e relatórios. |
| Aluno aprovado | Consultar suas turmas, tarefas, materiais, planos, eventos, notas, frequência e notificações; atualizar os dados permitidos e registrar solicitações relacionadas aos próprios dados. |

### Fluxo de inscrição

1. O visitante consulta os critérios, as turmas abertas e as vagas disponíveis.
2. O aluno, com apoio do responsável, preenche os dados pessoais, escolares e de contato, escolhe uma turma elegível, anexa a foto e a ficha assinada e aceita os termos vigentes.
3. A inscrição é recebida como pendente e pode ser acompanhada pelo fluxo público de status. O envio não significa aprovação automática.
4. Um ADM ou um professor autorizado para a turma analisa os dados e pode aprovar ou recusar a inscrição, registrando o motivo quando aplicável.
5. Após a aprovação, o aluno pode entrar na área correspondente e consultar os conteúdos e atividades disponíveis para suas turmas.

### Funcionalidades por área

- **Site público:** apresentação do projeto e da metodologia, modalidades e parceiros, informações de contato, chamada para inscrição e acesso à ficha, aos termos e à política de privacidade.
- **Inscrição:** formulário com dados do aluno e do responsável, seleção de turma conforme disponibilidade e requisitos, upload de foto JPG/PNG e ficha PDF assinada, aceite versionado dos termos e validações antes do envio.
- **Administração:** painel de indicadores; análise e pesquisa de inscrições; controles globais de abertura e capacidade; gestão de professores, modalidades, turmas e conteúdo público; revisão de pedidos de senha e solicitações de privacidade; geração de relatórios CSV, XLSX e PDF; e consulta ao log de auditoria.
- **Professor:** resumo de turmas e atividades; chamada e histórico de frequência; consulta de alunos; criação e manutenção de tarefas, materiais, planos de aula, eventos e avaliações; leitura e correção de respostas; envio de notificações; relatórios e manutenção do perfil.
- **Aluno:** resumo de atividades, frequência e avaliações; consulta e resposta a tarefas que permitem envio pela plataforma; leitura de materiais, planos, eventos e comunicados; atualização dos dados de perfil permitidos; e acompanhamento de solicitações de privacidade da própria conta.

O conteúdo público, os limites de cadastro e a disponibilidade das turmas são administráveis. Regras de idade, localização e requisitos de uma turma são exibidas durante a inscrição para apoiar a análise da equipe; requisitos em texto livre dependem de interpretação humana. Consulte o [catálogo de rotas e permissões da API](./docs/apis.md) para detalhes de cada operação.

### Tecnologias e arquitetura

- **Frontend:** React 19, TypeScript, Vite, React Router e Material UI; páginas e componentes reutilizáveis ficam em `frontend/src`.
- **API:** Node.js, Express 5 e TypeScript; rotas HTTP versionadas ficam em `backend/src/routes`, com autenticação, validação, autorização e integração com os serviços.
- **Persistência:** MongoDB por meio do Mongoose para contas, inscrições, turmas, atividades, configurações e eventos de auditoria.
- **Arquivos:** Cloudflare R2 privado para fichas, fotos e documentos publicados; o navegador envia arquivos por URLs temporárias, sem receber as credenciais do bucket.
- **Implantação prevista:** frontend na Vercel e API no Render, conectados a MongoDB e R2 configurados pelo operador.

O cliente não substitui as regras de autorização: as operações protegidas são verificadas também pela API. A visão geral das permissões e dos controles de privacidade está em [`docs/seguranca.md`](./docs/seguranca.md); as fontes de dados e categorias de informação estão em [`docs/inventario-dados.md`](./docs/inventario-dados.md).

## Galeria de telas

Capturas em computador (1440 px) e celular (390 px), incluindo páginas completas, painéis por perfil e alguns estados de interação. As telas autenticadas foram compostas com respostas de API e contas de demonstração exclusivamente no navegador; os nomes e endereços `.invalid` são fictícios. Nenhum cadastro foi criado, nenhuma credencial real foi usada e as capturas não representam dados de produção.

### Painéis administrativos, do professor e do aluno

#### Administração — visão geral

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-adm-visao-geral-desktop.png" width="720" alt="Visão geral do painel administrativo em computador"> | <img src="docs/screenshots/dashboard-adm-visao-geral-mobile.png" width="195" alt="Visão geral do painel administrativo em celular"> |

#### Professor — visão geral

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-professor-visao-geral-desktop.png" width="720" alt="Visão geral do painel do professor em computador"> | <img src="docs/screenshots/dashboard-professor-visao-geral-mobile.png" width="195" alt="Visão geral do painel do professor em celular"> |

#### Aluno — visão geral

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-aluno-visao-geral-desktop.png" width="720" alt="Visão geral do painel do aluno em computador"> | <img src="docs/screenshots/dashboard-aluno-visao-geral-mobile.png" width="195" alt="Visão geral do painel do aluno em celular"> |

<details>
<summary>Mais telas dos painéis e funcionalidades</summary>

#### Administração — inscrições

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-adm-inscricoes-desktop.png" width="720" alt="Análise e gestão de inscrições em computador"> | <img src="docs/screenshots/dashboard-adm-inscricoes-mobile.png" width="195" alt="Análise e gestão de inscrições em celular"> |

#### Professor — chamada e frequência

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-professor-presencas-desktop.png" width="720" alt="Chamada e frequência no painel do professor em computador"> | <img src="docs/screenshots/dashboard-professor-presencas-mobile.png" width="195" alt="Chamada e frequência no painel do professor em celular"> |

#### Professor — tarefas e respostas

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-professor-tarefas-desktop.png" width="720" alt="Tarefas e respostas no painel do professor em computador"> | <img src="docs/screenshots/dashboard-professor-tarefas-mobile.png" width="195" alt="Tarefas e respostas no painel do professor em celular"> |

#### Aluno — tarefas

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-aluno-tarefas-desktop.png" width="720" alt="Tarefas no painel do aluno em computador"> | <img src="docs/screenshots/dashboard-aluno-tarefas-mobile.png" width="195" alt="Tarefas no painel do aluno em celular"> |

#### Aluno — frequência

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/dashboard-aluno-frequencia-desktop.png" width="720" alt="Frequência no painel do aluno em computador"> | <img src="docs/screenshots/dashboard-aluno-frequencia-mobile.png" width="195" alt="Frequência no painel do aluno em celular"> |

</details>

### Página inicial

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/home-desktop.png" width="720" alt="Página inicial em computador"> | <img src="docs/screenshots/home-mobile.png" width="195" alt="Página inicial em celular"> |

<details>
<summary>Mais telas da página inicial</summary>

#### Página completa

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/home-completa-desktop.png" width="720" alt="Página inicial completa em computador"> | <img src="docs/screenshots/home-completa-mobile.png" width="195" alt="Página inicial completa em celular"> |

#### Metodologia

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/home-metodologia-desktop.png" width="720" alt="Metodologia em computador"> | <img src="docs/screenshots/home-metodologia-mobile.png" width="195" alt="Metodologia em celular"> |

#### Modalidades

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/home-modalidades-desktop.png" width="720" alt="Modalidades em computador"> | <img src="docs/screenshots/home-modalidades-mobile.png" width="195" alt="Modalidades em celular"> |

#### Parceiros

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/home-parceiros-desktop.png" width="720" alt="Parceiros em computador"> | <img src="docs/screenshots/home-parceiros-mobile.png" width="195" alt="Parceiros em celular"> |

</details>

<details>
<summary>Entrar, recuperar senha e fazer inscrição</summary>

#### Login

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/login-desktop.png" width="720" alt="Login em computador"> | <img src="docs/screenshots/login-mobile.png" width="195" alt="Login em celular"> |

#### Solicitação de troca de senha

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/login-recuperar-senha-desktop.png" width="720" alt="Solicitação de troca de senha em computador"> | <img src="docs/screenshots/login-recuperar-senha-mobile.png" width="195" alt="Solicitação de troca de senha em celular"> |

#### Inscrição

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/inscricao-desktop.png" width="720" alt="Formulário de inscrição em computador"> | <img src="docs/screenshots/inscricao-mobile.png" width="195" alt="Formulário de inscrição em celular"> |

#### Formulário completo

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/inscricao-completa-desktop.png" width="720" alt="Formulário completo em computador"> | <img src="docs/screenshots/inscricao-completa-mobile.png" width="195" alt="Formulário completo em celular"> |

</details>

<details>
<summary>Acompanhar inscrição, termos e privacidade</summary>

#### Acompanhamento da inscrição

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/status-inscricao-desktop.png" width="720" alt="Acompanhamento da inscrição em computador"> | <img src="docs/screenshots/status-inscricao-mobile.png" width="195" alt="Acompanhamento da inscrição em celular"> |

#### Confirmação de recebimento

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/status-inscricao-recebida-desktop.png" width="720" alt="Confirmação de recebimento em computador"> | <img src="docs/screenshots/status-inscricao-recebida-mobile.png" width="195" alt="Confirmação de recebimento em celular"> |

#### Termos de inscrição

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/termos-desktop.png" width="720" alt="Termos de inscrição em computador"> | <img src="docs/screenshots/termos-mobile.png" width="195" alt="Termos de inscrição em celular"> |

#### Política de privacidade

| Computador | Celular |
|:--:|:--:|
| <img src="docs/screenshots/privacidade-desktop.png" width="720" alt="Política de privacidade em computador"> | <img src="docs/screenshots/privacidade-mobile.png" width="195" alt="Política de privacidade em celular"> |

</details>

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

## Estrutura do repositório

```text
frontend/
  public/             Marca, documentos públicos e recursos estáticos
  src/
    components/       Componentes compartilhados
    routes/           Rotas da aplicação React
    services/         Chamadas à API
    views/            Páginas públicas e painéis por perfil
backend/
  src/
    config/           Ambiente e conexão com MongoDB
    middleware/       Autenticação, autorização e validações
    models/           Schemas e modelos Mongoose
    routes/            Endpoints HTTP versionados
    seed/              Dados de demonstração e limpeza explícita
    services/          Regras de negócio, auditoria, uploads e exportações
docs/                  API, segurança, dados, permissões e incidentes
scripts/               Geração de marca e ficha de inscrição
```

O `package.json` da raiz configura os workspaces npm e os comandos usados no desenvolvimento, build, seed e geração dos materiais do projeto. Consulte também [`docs/apis.md`](./docs/apis.md) para a API e [`docs/incidentes.md`](./docs/incidentes.md) para o procedimento documentado de resposta a incidentes.

**Nomenclatura:** páginas e componentes React usam `PascalCase`; funções, propriedades e serviços usam `camelCase`; nomes de URL usam minúsculas e hífens. Mantenha elementos visuais reutilizáveis em `components`, páginas compostas em `views`, lógica de HTTP em `services` e acesso ao MongoDB somente a partir do backend.

## Seed de demonstração

Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEACHER_EMAIL`, `TEACHER_PASSWORD`, `TEST_STUDENT_EMAIL` e `TEST_STUDENT_PASSWORD` no ambiente do backend. Na primeira inicialização, a API cria a conta ADM se ainda não houver uma e cria as contas de demonstração de professor e aluno se ainda não existirem. Para compatibilidade com a versão legada, se `ADMIN_EMAIL` corresponder a uma conta ativa com `role: "admin"`, a API migra esse registro para `role: "ADM"`, preenche o nome se estiver ausente e invalida a sessão antiga, preservando o hash da senha. As contas de demonstração podem entrar nos respectivos painéis. A API prepara uma turma e uma atividade isoladas para testar interações entre professor e aluno; os dados criados por esses perfis permanecem marcados como `isTestData`, não aparecem para contas normais e não podem ser associados a turmas reais. O ADM pode consultar os perfis de demonstração. Use e-mails distintos e senhas exclusivas com pelo menos 12 caracteres. O cadastro é idempotente: reiniciar a API não redefine senhas nem duplica contas. Se os e-mails de demonstração já pertencerem a contas comuns, a API preserva essas contas e registra um aviso; defina endereços novos e exclusivos em `TEACHER_EMAIL` e `TEST_STUDENT_EMAIL` para provisionar as contas e o espaço de teste.

Se precisar redefinir a senha de uma conta ADM existente, configure `MONGODB_URI` e `ADMIN_EMAIL` no `backend/.env`, permita temporariamente a conexão do seu IP no MongoDB Atlas e execute `npm run admin:reset-password` na raiz do repositório, em um terminal interativo. O comando pede e confirma a nova senha sem exibi-la, aplica as regras de senha, invalida sessões existentes e não altera outras contas. `ADMIN_PASSWORD` não redefine a senha de uma conta já cadastrada.

O comando `npm run seed` permanece destinado a dados locais de demonstração e não roda em produção. Ele cria um ADM, dois professores e **nove** alunos (seis aprovados, dois pendentes e um recusado), três turmas e exemplos de tarefas, materiais, presença, aula, evento e avaliação.

Os registros criados pela seed são marcados `isTestData` e não aparecem nos painéis das contas normais. Execute `npm run seed:clear` somente depois de definir `SEED_CLEAR_CONFIRM=yes`; a operação é bloqueada em produção e exclui somente registros de teste. Os esquemas ainda não aplicam o filtro a todas as entidades ou a todas as rotas futuras. Não utilize dados pessoais reais como dados de demonstração.

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

**Escopo e prontidão:** as áreas de ADM, professor e aluno incluem painéis e fluxos para as funcionalidades descritas acima. Os relatórios administrativos podem ser configurados por conjuntos de dados, colunas e filtros e exportados em CSV, Excel ou PDF. A recuperação pública de senha não altera senhas automaticamente; a equipe deve confirmar a identidade antes de atender o pedido. A API implementa autorização por perfil e, para operações de turma, restringe o acesso às turmas e aos registros autorizados.

Isso não equivale a uma certificação de segurança ou conformidade legal, nem significa que a implantação esteja pronta para receber dados reais. O projeto ainda precisa de testes automatizados mais abrangentes, revisão das configurações de produção, definição e validação dos processos de retenção e atendimento aos direitos dos titulares e análise dos termos e políticas pelo controlador. Leia [`docs/seguranca.md`](./docs/seguranca.md) e valide as bases legais, os fornecedores, os backups e os procedimentos operacionais antes de qualquer uso com pessoas reais.

## Contribuição

1. Confirme se há uma camada correta antes de adicionar um componente.
2. Extraia os elementos visuais reutilizados em `frontend/src/components/`.
3. Mantenha lógica de API fora dos componentes de UI.
4. Não envie arquivos `.env`, dados de alunos, fichas ou credenciais ao repositório.
5. Use mensagens de commit no padrão Conventional Commits (`feat:`, `fix:`, `docs:`).
6. Rode os dois builds de TypeScript antes de propor alterações.
