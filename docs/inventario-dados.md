# Inventário de dados pessoais

## Cadastro de inscrição

| Dado | Finalidade | Armazenamento | Acesso |
|---|---|---|---|
| Nome, e-mail, senha com bcrypt | Identificação e futura autenticação do inscrito | `User` no MongoDB; senha em `passwordHash` (nunca texto puro) | O próprio titular e usuários autorizados |
| Idade e data de nascimento | Dados declarados para análise da inscrição | `User.age`, `User.birthDate` | ADM; professor com atribuição correspondente |
| Gênero, modalidade, escola | Dados declarados para análise da inscrição | `User.gender`, `User.modality`, `User.school` | ADM; professor com atribuição correspondente |
| Bairro, cidade, rua, número, complemento | Cadastro e análise da inscrição | `User.address` | ADM; professor com atribuição correspondente |
| Nome e telefone do responsável | Contato sobre a inscrição de aluno menor | `User.guardian` | ADM; professor com atribuição correspondente |
| Foto e ficha assinada | Análise da inscrição | Bucket privado no R2; chaves opacas no MongoDB | Serviço e equipe autorizada |
| Consentimento, versão, data e IP | Registro do aceite | `User.termsAcceptedAt`, `termsAcceptedIp`, `termsVersion` | ADM |

## Dados operacionais

Identificador de usuário, perfil, turmas, estado da inscrição e timestamps são armazenados em `User`. Tokens de refresh são persistidos somente como hash; senhas antigas são hasheadas. Logs de auditoria incluem ator, ação, recurso, IP, data e metadados. O histórico de ações é uma nova linha na coleção de auditoria.

## Fornecedores e localização

| Fornecedor | Dados/processamento |
|---|---|
| MongoDB (URI configurada pelo operador) | Usuários, turmas, inscrições e auditoria |
| Cloudflare R2 | Foto e ficha por chave não pública |
| Render | Execução da API; o operador precisa revisar e configurar os logs e a retenção |
| Vercel | Entrega da aplicação web |

Não configure a API sem política de retenção e região aprovadas para a finalidade real. Prazo de retenção, bases legais, compartilhamentos e prazos de backups devem ser definidos pelo controlador: não estão presumidos nesta base.
