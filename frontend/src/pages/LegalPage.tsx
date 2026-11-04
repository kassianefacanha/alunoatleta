import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Link, Paper, Typography } from '@mui/material';
import { PublicLayout } from '../components/templates/PublicLayout';

const documents = {
  'termos-de-inscricao': {
    title: 'Termos de Inscrição',
    sections: [
      ['Participação', 'A inscrição solicita participação nas atividades esportivas do Aluno Atleta. O envio não garante vaga: a equipe responsável analisará os dados e documentos e informará a decisão na plataforma.'],
      ['Responsabilidade do responsável', 'O responsável deve fornecer informações corretas e manter os contatos atualizados. A ficha de inscrição deve ser preenchida e assinada pelo responsável legal quando aplicável.'],
      ['Uso da plataforma', 'Após aprovação, o aluno poderá acessar recursos relacionados à turma, atividades, materiais e acompanhamento de desenvolvimento. O uso deve respeitar os demais participantes e as orientações dos professores.'],
      ['Correção e atualização', 'Em caso de recusa, o motivo será disponibilizado para que os dados sejam revisados e a inscrição reenviada. A foto de perfil não pode ser alterada após o cadastro.']
    ]
  },
  'politica-de-privacidade': {
    title: 'Política de Privacidade',
    sections: [
      ['Dados tratados', 'Para inscrição e acompanhamento, o sistema pode tratar nome, data de nascimento, idade, sexo, e-mail, escola, endereço, telefone do responsável, foto, ficha assinada, registros de presença, tarefas, avaliações e interações da turma.'],
      ['Finalidades', 'Os dados são usados para analisar inscrições, administrar turmas e atividades, manter a segurança da conta e registrar o acompanhamento educacional e esportivo. O aceite é registrado com data e hora, endereço IP e versão do termo.'],
      ['Armazenamento e acesso', 'Dados estruturados são mantidos no sistema e documentos ficam em armazenamento privado. O acesso é limitado de acordo com o papel do usuário e o vínculo com a turma. Documentos são disponibilizados por links temporários autenticados.'],
      ['Direitos, controlador e contato', 'O projeto informou “Atleta Aluno” como controlador e atletaaluno@suporte.gmail.com como canal de contato. O titular ou responsável pode usar esse canal para solicitar confirmação, acesso, correção ou demais direitos previstos na LGPD. A identificação jurídica do controlador, as bases legais por finalidade e os prazos de retenção e exclusão ainda precisam ser formalizados e validados antes da coleta oficial.']
    ]
  }
} as const;

export function LegalPage({ document }: { document: keyof typeof documents }) {
  const content = documents[document];
  if (!content) return <PublicLayout><Box sx={{ maxWidth: 760, mx: 'auto', my: 6 }}><Typography variant="h4">Documento não encontrado</Typography></Box></PublicLayout>;
  return (
    <PublicLayout>
      <Box sx={{ maxWidth: 760, mx: 'auto', my: { xs: 3, md: 6 }, px: 2 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h3" sx={{ mb: 1 }}>{content.title}</Typography>
          <Alert severity="warning" sx={{ mb: 3 }}>
            {document === 'politica-de-privacidade'
              ? 'Política em rascunho. Não use para coleta oficial antes de confirmar a identificação jurídica do controlador e o canal de contato, definir bases legais e prazos de retenção e validar o texto com assessoria jurídica, especialmente por envolver menores.'
              : 'Termos em rascunho. Valide o texto com a equipe responsável e assessoria jurídica antes do uso oficial.'}
          </Alert>
          {content.sections.map(([title, text]) => (
            <Box key={title} sx={{ mb: 2.5 }}>
              <Typography variant="h6" fontWeight={750}>{title}</Typography>
              <Typography color="text.secondary" sx={{ mt: .5, lineHeight: 1.8 }}>{text}</Typography>
            </Box>
          ))}
          <Link component={RouterLink} to="/inscricao" underline="hover" fontWeight={700}>Voltar para a inscrição</Link>
        </Paper>
      </Box>
    </PublicLayout>
  );
}
