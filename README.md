# Aluno Atleta

Sistema full-stack para inscrições, gestão de turmas esportivas e acompanhamento de alunos. A interface e a API usam português brasileiro; identificadores e nomes internos seguem convenções em inglês para manter consistência com as bibliotecas.

## Stack e arquitetura

- **Frontend:** Vite, React 18, TypeScript, Material UI, React Router, React Hook Form e Zod.
- **Backend:** Node.js, Express, TypeScript, Zod e Mongoose.
- **Dados:** MongoDB. O modelo `User` contém identidade, credenciais e papel; `Student` guarda o perfil esportivo e o estado da inscrição.
- **Autenticação:** JWT de acesso (15 min) e refresh (7 dias), rotação de refresh token e hash bcrypt. As rotas privadas usam Bearer token e RBAC.
- **Arquivos:** Cloudflare R2 via SDK S3. MongoDB guarda somente as keys; downloads são URLs assinadas com validade de 10 minutos.
- **Relatórios:** CSV com `csv-stringify`, XLSX com ExcelJS e PDF com PDFKit.
- **Deploy:** frontend Vercel e API Render. `render.yaml` contém o serviço da API; `frontend/vercel.json` habilita fallback SPA.

## Desenvolvimento local

Pré-requisitos: Node.js 20+, npm e MongoDB (local ou Atlas).

```powershell
npm.cmd install
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
npm.cmd run dev
```

Edite `backend\.env` e configure MongoDB, dois segredos JWT diferentes (mínimo de 32 caracteres), as credenciais do administrador e do professor padrão (senhas diferentes com no mínimo 12 caracteres) e credenciais R2. Os e-mails padrão devem ser diferentes. O bucket deve ter CORS liberado para `http://localhost:3000`. A aplicação fica em `http://localhost:3000`, a API em `http://localhost:5000` e o health check em `/health`.

Ao iniciar a API, depois de conectar ao MongoDB, o sistema cria automaticamente o administrador e o professor definidos por `ADMIN_EMAIL`/`ADMIN_PASSWORD` e `TEACHER_EMAIL`/`TEACHER_PASSWORD`. Em desenvolvimento, configurar `TEST_STUDENT_EMAIL` e `TEST_STUDENT_PASSWORD` cria também um aluno de demonstração já aprovado, associado à primeira turma ativa se houver. As credenciais ficam apenas no `backend/.env` local; a configuração é proibida em produção. A inicialização é idempotente: usuários existentes com os papéis corretos são mantidos e suas senhas não são redefinidas. Se um e-mail de bootstrap já pertencer a outro papel, a API interrompe a inicialização com erro explícito, em vez de alterar a conta.

Para executar o mesmo bootstrap manualmente:

```powershell
npm.cmd run seed:users --workspace backend
```

Guarde senhas fortes somente no `.env` local (não versionado) ou no gerenciador de variáveis do Render. O `render.yaml` exige que os quatro valores sejam definidos no painel.

## Schemas e capacidades da API

Os schemas Mongoose estão em `backend/src/models/index.ts`. O domínio cobre usuários e permissões, alunos e aceite LGPD, turmas, chamadas, tarefas e entregas, materiais, planos de aula, notificações, eventos, avaliações, publicações, comentários e auditoria.

Rotas iniciais em `/api/v1`:

| Rota | Acesso | Uso |
|---|---|---|
| `POST /auth/register` | público com limite de requisições | Inscrição e criação de conta pendente |
| `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | login / autenticado | Sessão e perfil |
| `PATCH /auth/resubmit` | aluno autenticado recusado | Corrigir e reenviar inscrição |
| `POST /uploads/registration-presign` | público com rate limit dedicado | Upload prévio de documentos da inscrição |
| `POST /uploads/presign`, `/confirm`, `GET /download` | aluno autenticado | Upload permitido de ficha e download dos próprios documentos |
| `POST /uploads/materials/presign`, `GET /uploads/materials/:id/download` | ADM / professor para upload; membros da turma para download | Materiais privados no R2, limitados a PDF/JPG/PNG e 10 MB |
| `GET /students`, `PATCH /students/:id/review` | ADM / professor | Filtros e análise de inscrição |
| `GET/PATCH /students/me`, `GET /students/me/development` | aluno aprovado | Consulta e atualização do perfil e desenvolvimento |
| `POST /classes`, `PATCH /classes/:id`, `GET/POST /attendance`, `/assignments`, `/materials`, `/notifications`, `/events`, `/lesson-plans`, `/evaluations` | ADM / professor; professor só edita a própria turma | Operação e edição de turmas, chamadas e atividades |
| `GET /assignments`, `POST /assignments/:id/submissions`, `GET /assignments/:id/submissions` | Membros da turma / ADM / professor responsável | Consultar tarefas, entregar respostas e acompanhar entregas autorizadas |
| `GET/POST /materials`, `GET/POST /notifications`, `PATCH /notifications/:id/read` | Membros da turma / ADM / professor responsável | Publicar materiais em texto, link ou arquivo e avisos; marcar notificações como lidas |
| `GET/POST /events`, `GET/POST /lesson-plans`, `GET/POST /evaluations` | Membros da turma / ADM / professor responsável | Divulgar eventos, consultar planos de aula e acompanhar avaliações |
| `GET /dashboard/stats` | ADM / professor / aluno aprovado | Indicadores globais para ADM; dados das próprias turmas para professores; métricas do próprio aluno |
| `GET /audit-logs?action=...&resource=...&from=...&to=...`, `PUT /teachers/:id/permissions`, `PATCH /teachers/:id/status` | ADM | Auditoria filtrável (até 200 registros), permissões e ativação de professores; desativar revoga o refresh token e bloqueia imediatamente o uso de tokens de acesso |
| `GET/POST /social/posts`, `POST /social/posts/:id/comments` e `/like` | membros autorizados da turma | Publicações com texto/links, comentários e curtidas; sem fotos ou arquivos |
| `GET /exports/options`, `/exports/students?format=csv\|xlsx\|pdf&columns=fullName,age`, `/exports/:table?format=csv\|xlsx\|pdf&columns=...&classId=...&from=...&to=...` | ADM / professor com permissão `exports:read` | Exportação de alunos e tabelas operacionais com filtros de turma/período e seleção de colunas |
| `GET /documents/enrollment-form.pdf` | público | Ficha-modelo para impressão e assinatura |

O endpoint de inscrição compara idade e nascimento com tolerância de um ano, valida os tipos/tamanhos dos objetos no R2, persiste endereço e responsável, e registra data/hora, IP e versão dos termos. O formulário exige foto JPG/PNG (5 MB), ficha PDF (10 MB) e aceite.

## Upload R2 e segurança

Crie o bucket `aluno-atleta-uploads` e uma API token restrita a **Object Read & Write** nesse bucket. Variáveis necessárias estão em `backend/.env.example`; nenhuma chave secreta vai para o Vite.

O upload usa URLs PUT pré-assinadas por 300 segundos e assina `Content-Type` e tamanho declarado. A inscrição pública precisa enviar os documentos antes da conta existir; por isso, `registration-presign` é a exceção pública ao fluxo autenticado. Keys ficam sob `registration/{id}/` e só são vinculadas depois de conferir existência, MIME e tamanho real no cadastro. Uploads de documentos autenticados ficam sob `students/{id}/`; aluno só acessa os próprios arquivos, professor precisa ter relação com turma/inscrição e administrador pode acessar documentos. Foto cadastrada não pode ser substituída. Materiais de apoio ficam em `materials/{classId}/{uuid}`; a API confere tipo, extensão, tamanho real e vínculo com a turma antes de salvar a key. Downloads exigem vínculo ativo com a turma e usam URLs assinadas de leitura por 10 minutos.

Configure o CORS do bucket R2 (troque a origem de produção pelo domínio real da Vercel):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://seu-projeto.vercel.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Não publique o bucket nem a ficha assinada. Use download autenticado e URL GET com validade curta. O browser faz upload direto ao R2; MIME e tamanho são novamente verificados pelo backend antes de criar a inscrição.

## Deploy

### Render (API)

Conecte o repositório, use o blueprint `render.yaml` e configure `MONGODB_URI`, `FRONTEND_ORIGIN`, as credenciais de administrador e professor, credenciais/endpoint R2 e `TERMS_VERSION` no painel. Render gera os segredos JWT via `generateValue`. No primeiro start a API cria as duas contas padrão automaticamente; mantenha os e-mails e senhas em segredo no painel. O health check é `/health`.

### Vercel (frontend)

Importe o repositório, defina `frontend` como diretório raiz e `VITE_API_URL` como `https://<servico>.onrender.com/api/v1`. Build: `npm run build`; output: `dist`. Adicione a URL real da Vercel em `FRONTEND_ORIGIN` no Render e nas origens CORS do R2. Deploys do Vite não devem conter variáveis `R2_*`.

## Atomic Design e guia de contribuição

A identidade visual da interface segue os materiais de referência do Projeto Aluno/Atleta: azul institucional como cor principal, branco e cinza-azulado nas superfícies, e verde e amarelo/laranja apenas como cores de apoio. A marca usada no cabeçalho é um recorte do símbolo fornecido nos documentos do projeto, em `frontend/public/brand/aluno-atleta-mark.jpg`; os códigos de cor foram aproximados visualmente a partir dos PDFs e podem ser refinados com o manual oficial de marca, se houver.

Componentes React ficam em `frontend/src/components` por nível:

- **Átomos (`atoms/`):** unidades visuais independentes, como `Brand`, `SectionHeading` e `FilePicker`.
- **Moléculas (`molecules/`):** combinações reutilizáveis de átomos, como `FormTextField` e `StatCard`.
- **Organismos (`organisms/`):** blocos completos com comportamento, como `RegistrationForm`.
- **Templates (`templates/`):** estruturas de página sem conteúdo de domínio, como `PublicLayout` e `DashboardLayout`.
- **Páginas (`pages/`):** composição final ligada às rotas.

Ao contribuir, mantenha cada componente no nível mais simples capaz de representá-lo; promova-o apenas quando realmente compuser outros elementos. Schemas Zod de formulário ficam em `src/lib`, chamadas HTTP em `src/lib/api.ts`, tema global em `src/theme.ts` e estilos estruturais em `src/styles.css`. Evite lógica de rede em átomos, duplicação de validações e dependência de uma página dentro de componentes inferiores. Componentes devem ser acessíveis, responsivos e usar tokens MUI. Novas rotas devem validar entrada no backend, aplicar papel/vínculo à turma e registrar auditoria quando alterarem dados administrativos.

## Decisões de produto e limites da primeira entrega

- `User` e `Student` são coleções separadas para preservar uma identidade compartilhada e permitir professores/administradores sem dados de atleta.
- Inscrição e aluno aprovado são estados do mesmo perfil. Uma conta autenticada ainda pendente recebe status, mas recursos esportivos dependem da aprovação.
- Aluno aprovado pode atualizar nome, escola, endereço e contato do responsável em `/meu-perfil`; o e-mail é somente leitura e a foto da inscrição não pode ser substituída. A mesma página reúne chamadas, avaliações e tarefas entregues do próprio aluno.
- ADM e professores com a permissão `exports:read` usam `/exportacoes` para selecionar tabela, colunas e formato; professores exportam somente dados de turmas sob sua responsabilidade.
- O administrador pode ativar ou desativar professores na tela de turmas; a desativação bloqueia novos logins, revoga o refresh token e invalida imediatamente os tokens de acesso existentes.
- Professor revisa alunos de modalidade atendida e associa turma ao aprovar; administradores têm escopo global.
- O schema social não possui campo de mídia: alunos e professores podem publicar texto/link, nunca fotos.
- Tokens da demonstração web ficam em `sessionStorage` (não em armazenamento persistente). Para produção com conteúdo sensível, recomenda-se migrar refresh token para cookie `HttpOnly`, `Secure`, `SameSite` e adicionar política CSP.
- A interface inclui telas de gestão de alunos, turmas, chamadas, tarefas, materiais/avisos, eventos/avaliações e rede social, além do perfil e desenvolvimento do aluno. A tela `/exportacoes` oferece seleção de tabelas/colunas, filtros de turma e período e formatos CSV, XLSX e PDF para alunos e tabelas operacionais.
- A navegação autenticada agrupa rotas por atividade e perfil, com menus compactos no desktop e drawer agrupado no celular; o painel destaca inscrições pendentes para a equipe responsável.
- Alunos, turmas, chamadas e auditoria usam tabelas MUI Data Grid com localização pt-BR, paginação e carregamento integrado. Filtros avançados e detalhes de auditoria abrem em diálogos; formulários de criação de turma, tarefa, material, aviso, evento, plano de aula e avaliação ficam fora das telas de consulta.
- As páginas públicas e autenticadas oferecem atalho para pular a navegação, foco visível para teclado e conteúdo principal semântico. O painel indica carregamento das estatísticas e permite tentar novamente quando a consulta falha.
- Os textos de Termos de Inscrição e Política de Privacidade incluídos na interface são rascunhos funcionais, marcados para revisão; o responsável pelo projeto deve validá-los juridicamente antes de coletar dados reais.

## Verificações

```powershell
npm.cmd run typecheck
npm.cmd run build
```
