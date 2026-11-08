# API

Todas as rotas usam o prefixo `/api/v1`.

| Método | Caminho | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/health` | Público | Saúde do serviço |
| `POST` | `/auth/register` | Público, limite por IP | Valida e cadastra inscrição pendente após anexos confirmados e aceite |
| `GET` | `/auth/registration-options` | Público | Lista turmas disponíveis somente quando inscrições de alunos estão abertas e há limite global |
| `POST` | `/auth/login` | Público, 8 tentativas/15 min/IP | Login; emite access token e cookie refresh HttpOnly |
| `POST` | `/auth/refresh` | Cookie HttpOnly | Rotaciona o refresh token e emite novo access token |
| `POST` | `/auth/logout` | Cookie HttpOnly | Revoga a sessão refresh ativa |
| `POST` | `/auth/password` | Access token | Atualiza a senha, rejeita as oito anteriores e encerra a sessão refresh |
| `POST` | `/auth/password-reset-requests` | Público, 3 tentativas/hora/IP | Solicita recuperação de senha de aluno aprovado; não confirma se a conta existe |
| `GET` | `/public/modalities` | Público | Lista modalidades com ícone e cor para o site |
| `GET` | `/public/site-content` | Público | Obtém textos legais e de apresentação, contatos e links para documentos públicos |
| `GET` | `/public/content-files/:kind` | Público | Redireciona para link temporário privado da ficha ou regulamento publicado |
| `POST` | `/uploads/presign` | Público, limite geral | Solicita upload assinado e restrito a um dos tipos permitidos |
| `POST` | `/uploads/confirm` | Público, limite geral | Confirma no servidor conteúdo e tamanho enviados ao R2 |
| `GET` | `/students` | ADM/Professor | Lista inscrições pendentes e aprovadas com busca e paginação |
| `GET` | `/students/:id/details` | ADM/Professor das turmas vinculadas | Exibe dados completos, requisitos das turmas e links temporários dos documentos |
| `PATCH` | `/students/:id/review` | ADM/Professor | Aprova ou recusa inscrição, registrando recusa justificada |
| `GET` | `/teacher/classes` | Professor | Lista as próprias turmas |
| `GET` | `/teacher/dashboard` | Professor | Exibe estatísticas e próximos eventos/tarefas das turmas vinculadas |
| `GET` / `PATCH` | `/teacher/profile` | Professor | Consulta e atualiza os dados do perfil |
| `GET` | `/teacher/class-students?classId=:id` | Professor responsável pela turma | Lista alunos aprovados da turma para avaliações e comunicados |
| `POST` | `/teacher/classes` | Professor | Cria turma com modalidade, limite de alunos, início/fim das inscrições e requisitos |
| `PATCH` | `/teacher/classes/:id` | Professor responsável pela turma | Atualiza os dados da turma; o limite não pode ser menor que as inscrições pendentes e alunos aprovados |
| `GET` / `POST` | `/teacher/attendance` | Professor responsável pela turma | Consulta ou registra chamada para uma data |
| `GET` | `/teacher/attendance/history?classId=:id` | Professor responsável pela turma | Consulta o histórico resumido de frequência |
| `GET` / `POST` | `/teacher/work/:resource` | Professor | Lista ou cria tarefas, materiais, planos de aula, eventos ou avaliações nas próprias turmas |
| `PATCH` / `DELETE` | `/teacher/work/:resource/:id` | Professor criador do registro | Atualiza ou remove um registro da própria turma |
| `POST` | `/teacher/notifications` | Professor responsável pela turma | Envia comunicado para alunos aprovados da turma ou destinatário individual |
| `GET` | `/teacher/task-responses` | Professor | Lista respostas recebidas para tarefas criadas pelo professor |
| `PATCH` | `/teacher/task-responses/:id/grade` | Professor criador da tarefa | Registra nota e feedback de uma resposta |
| `GET` | `/teacher/reports` | Professor | Consulta dados de frequência, avaliações, tarefas e respostas; aceita `from` e `to` |
| `GET` | `/student/dashboard` | Aluno aprovado | Consulta os dados pessoais, turmas e conteúdos vinculados à própria conta |
| `PATCH` | `/student/profile` | Aluno aprovado | Atualiza dados pessoais permitidos, sem alterar e-mail, senha ou foto |
| `PATCH` | `/student/notifications/:id/read` | Aluno destinatário | Marca como lida uma notificação recebida pelo próprio aluno |
| `POST` | `/student/lgpd-requests` | Aluno aprovado | Registra uma solicitação LGPD e vincula ao titular autenticado |
| `GET` | `/student/lgpd-requests/:id/export` | Aluno titular de solicitação de portabilidade concluída pelo ADM | Baixa JSON dos próprios dados; solicitações não aprovadas não liberam o arquivo |
| `POST` | `/student/tasks/:id/response` | Aluno aprovado da turma | Envia ou atualiza a resposta de uma tarefa que aceita resposta na plataforma |
| `GET` | `/admin/reports/options` | ADM | Lista os conjuntos de dados, colunas disponíveis, turmas e modalidades para configurar um relatório |
| `POST` | `/admin/reports/export` | ADM | Gera relatório CSV, Excel (`xlsx`) ou PDF com seleção de conjuntos, colunas e filtros |
| `POST` | `/admin/reports/registration-timeline/pdf` | ADM | Exporta em PDF o gráfico mensal de inscrições dos últimos 12 meses |
| `GET` | `/admin/password-reset-requests` | ADM | Lista solicitações e a contagem pendente para notificação do painel |
| `PATCH` | `/admin/password-reset-requests/:id/complete` | ADM | Define a nova senha do aluno e conclui a solicitação |
| `PATCH` | `/admin/password-reset-requests/:id/reject` | ADM | Recusa uma solicitação de recuperação |
| `GET` | `/admin/lgpd-requests` | ADM | Lista solicitações LGPD para análise |
| `PATCH` | `/admin/lgpd-requests/:id` | ADM | Atualiza status e parecer; concluir portabilidade libera o download do titular |
| `PATCH` | `/admin/users/:id/password` | ADM | Altera a senha de aluno ou professor ativo |
| `GET` | `/admin/modalities` | ADM | Lista modalidades configuráveis |
| `POST` / `PATCH` | `/admin/modalities` e `/admin/modalities/:id` | ADM | Mantém modalidade, descrição, ícone e cor |
| `GET` / `PATCH` | `/admin/registration-settings` | ADM | Consulta e atualiza os limites globais e a abertura de inscrições de alunos e professores |
| `GET` / `PATCH` | `/admin/site-content` | ADM | Consulta e publica textos públicos, contatos, termos versionados e documentos em PDF |
| `POST` | `/admin/site-content/upload-url` | ADM | Cria URL temporária de envio de ficha ou regulamento PDF ao R2 |
| `GET` | `/audit` | ADM | Consulta logs de auditoria paginados e filtrados por usuário, ação, entidade, período e IP |

O pedido público de inscrição exige os arquivos previamente carregados, a versão atual dos termos, o consentimento e a confirmação de leitura dos requisitos de texto livre definidos para a turma. A aplicação exibe esses critérios, mas não interpreta nem valida automaticamente seu conteúdo. Token de acesso expira em 15 minutos. A sessão de refresh expira em 7 dias, usa cookie HttpOnly/SameSite Strict e muda a cada renovação. Conteúdo de dados pessoais é minimizado em respostas de listagem.

Os limites de inscrição são globais. Alunos contam quando estão pendentes ou aprovados; professores contam enquanto ativos. Recusados, desativados e dados de teste não ocupam vagas. A abertura de inscrições de alunos controla o cadastro público; a de professores controla novos cadastros realizados pela administração. As restrições são aplicadas no servidor, inclusive para envios simultâneos, e não removem contas existentes caso o limite seja reduzido.

O painel ADM publica textos da página inicial, contatos, termos e política, além de ficha de inscrição e regulamento em PDF. Alterar o texto legal exige incrementar sua versão. Os arquivos são validados como PDF e armazenados no R2 privado; a rota pública emite redirecionamentos para URLs temporárias. Cores das modalidades ficam restritas a uma paleta pastel predefinida com foregrounds de alto contraste.

Solicitações públicas de recuperação pedem nome e e-mail, recebem resposta genérica e não alteram a senha automaticamente. A administração deve confirmar a identidade do aluno antes de definir uma senha. Alterações administrativas também aplicam o histórico de senhas e revogam a sessão refresh da conta.

O gerador aceita inscrições/alunos, professores, turmas, modalidades, presenças, tarefas e respostas, materiais, planos de aula, notificações, eventos, avaliações, auditoria e solicitações LGPD. Os filtros de período, busca textual, turma, modalidade, situação da inscrição, presença e inclusão de dados de teste são aplicados quando relevantes ao conjunto. É possível selecionar as colunas de cada seção; colunas pessoais ficam desmarcadas inicialmente, e exportações são registradas na auditoria. Cada arquivo aceita no máximo 5.000 registros; reduza o período ou refine os filtros se esse limite for ultrapassado.

## Exemplos

```json
{
  "email": "aluno@exemplo.com",
  "password": "UmaSenha!2026"
}
```

```json
{
  "fileName": "ficha.pdf",
  "contentType": "application/pdf",
  "uploadType": "signedFormPdf"
}
```

O CORS aceita apenas `CLIENT_ORIGIN`; em implantação pública, prefira origens HTTPS, configurar o CORS do R2 para o mesmo domínio e revisar a aplicação dos limites de requisição a partir do IP encaminhado pelo proxy.
