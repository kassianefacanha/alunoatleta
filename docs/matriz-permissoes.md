# Matriz inicial de permissões

| Recurso | ADM | Professor | Aluno |
|---|---|---|---|
| Autenticar | Sim | Sim | Somente após aprovação |
| Solicitar inscrição pública | — | — | Sim |
| Listar inscrições/alunos | Tudo, incluindo dados de seed | Atribuídos a suas turmas; dados de seed excluídos | Não |
| Aprovar/recusar inscrição | Não implementado | Inscrições pendentes atribuídas às turmas | Não |
| Consultar logs de auditoria | Sim | Não | Não |
| Criar/editar/encerrar turmas | Interface ainda não implementada | Interface ainda não implementada | Não |
| Consultar nota, presença, material e tarefa | Interface e autorização por registro ainda incompletas | Não implementado | Não implementado |
| Gerenciar solicitações LGPD | Não implementado | Não | Não |

Todas as rotas novas devem impor autorização no servidor; esconder um botão no cliente não constitui controle de acesso. Não ative usuários de demonstração em uma implantação com alunos reais.
