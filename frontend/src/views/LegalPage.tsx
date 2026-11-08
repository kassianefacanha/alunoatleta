import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowBackRounded } from "@mui/icons-material";
import { Button, Container } from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";
import { apiGet } from "../services/api";

interface LegalPageProps {
  privacy?: boolean;
}

interface PublicLegalContent {
  termsVersion: string;
  termsUpdatedAt: string;
  termsContent: string;
  privacyContent: string;
}

const fallbackContent = {
  termsContent: "QUEM PODE SE INSCREVER\nA ficha deve ser preenchida pelo aluno com a ajuda de seu responsável. O envio de uma inscrição não garante vaga, acesso ou aprovação imediata.\n\nINFORMAÇÕES E DOCUMENTOS\nInforme dados corretos e atuais. Anexe uma foto em JPG ou PNG e uma ficha de inscrição legível em PDF, assinada pelo responsável. Cada arquivo pode ter até 5 MB.\n\nREVISÃO DA INSCRIÇÃO\nA equipe do projeto avalia os dados enviados. A inscrição permanece pendente durante a revisão. Em caso de recusa, a plataforma informa o motivo e permite que a equipe entre em contato sobre uma correção.\n\nDADOS PESSOAIS\nO envio da inscrição registra seu aceite da política de privacidade indicada, a versão dos termos, a data e o IP da solicitação. Leia a Política de Privacidade e peça ajuda a seu responsável antes de continuar.\n\nACESSO AO SISTEMA\nAs funcionalidades para alunos ficam disponíveis após aprovação. O login de professores é fornecido pela coordenação. Não compartilhe sua senha e avise à equipe se suspeitar de acesso indevido.\n\nDOCUMENTO PROVISÓRIO\nEste texto é um rascunho para a implementação técnica e deve ser revisado pela organização responsável antes de ser usado para receber inscrições reais.",
  privacyContent: "DADOS TRATADOS\nDurante a inscrição são solicitados nome, e-mail, senha, data de nascimento, idade, gênero, modalidade, escola, endereço, nome e telefone do responsável. Também recebemos a foto do aluno e a ficha assinada pelo responsável. Registramos o aceite, sua data, a versão do documento e o IP da solicitação.\n\nFINALIDADE\nOs dados são solicitados para analisar a inscrição, permitir comunicação com o aluno e seu responsável e, após aprovação, preparar o acesso aos serviços do projeto. Os documentos anexados são usados para análise da inscrição.\n\nCOMPARTILHAMENTO E FORNECEDORES\nPara funcionamento do serviço, os dados podem ser processados na hospedagem da aplicação (Vercel), da API (Render), no banco configurado pelo operador (MongoDB) e no armazenamento de arquivos (Cloudflare R2). A conexão e os provedores utilizados dependem da configuração de implantação do projeto.\n\nPROTEÇÃO E ACESSO\nAs credenciais são armazenadas com hash e os arquivos são carregados para armazenamento privado por links temporários. O acesso às informações pessoais deve se limitar à equipe autorizada a avaliar e administrar o projeto. Não coloque dados pessoais em material de demonstração.\n\nRETENÇÃO E DIREITOS\nO controlador ainda precisa definir os prazos de conservação das inscrições, dos arquivos, dos logs e dos backups e os procedimentos para acesso, correção, eliminação, portabilidade, anonimização e revogação. A equipe responsável deve publicar um canal de atendimento para dúvidas e solicitações de privacidade antes de receber dados reais.\n\nIMPORTANTE\nEste documento é um rascunho técnico, não substitui uma política validada pelo controlador. Antes de coletar dados reais, a equipe responsável deve conferir as finalidades, as bases legais, os operadores e os prazos de retenção aplicáveis.",
};

function renderContent(value: string) {
  return value.split(/\n\s*\n/).map((block, index) => {
    const [firstLine, ...rest] = block.split("\n");
    const heading = firstLine === firstLine.toLocaleUpperCase("pt-BR") && firstLine.length < 100;
    return (
      <div key={`${index}-${firstLine}`}>
        {heading && <h2>{firstLine}</h2>}
        <p>{heading ? rest.join(" ") : block.replace(/\n/g, " ")}</p>
      </div>
    );
  });
}

export function LegalPage({ privacy = false }: LegalPageProps) {
  const heading = privacy ? "Política de Privacidade" : "Termos de Inscrição";
  const [content, setContent] = useState<PublicLegalContent | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<PublicLegalContent>("/public/site-content")
      .then((result) => { if (active) setContent(result); })
      .catch(() => { if (active) setContent(null); });
    return () => { active = false; };
  }, []);

  const legalText = privacy
    ? content?.privacyContent ?? fallbackContent.privacyContent
    : content?.termsContent ?? fallbackContent.termsContent;
  const version = content?.termsVersion ?? "1.0";
  const updatedAt = content?.termsUpdatedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(content.termsUpdatedAt))
    : "Data não informada";

  return (
    <main className="legal-page">
      <header className="registration-header">
        <Link to="/" className="brand-link" aria-label="Voltar à página inicial">
          <BrandLogo className="brand-logo nav-logo" />
        </Link>
        <Button component={Link} to="/" startIcon={<ArrowBackRounded />} color="inherit">
          Voltar ao início
        </Button>
      </header>
      <Container maxWidth="md">
        <article className="legal-card">
          <span className="section-eyebrow">PROJETO ALUNO / ATLETA · VERSÃO {version}</span>
          <h1>{heading}</h1>
          <p>Última atualização: {updatedAt}</p>
          <p>Projeto Aluno / Atleta · Alto da Mangueira, Maracanaú, Ceará.</p>
          <div className="legal-content">{renderContent(legalText)}</div>
          {!privacy && <p>Leia também a <Link to="/privacidade">Política de Privacidade</Link> antes de enviar sua inscrição.</p>}
          <Button component={Link} to="/inscricao" variant="contained" sx={{ mt: 2 }}>Voltar à inscrição</Button>
        </article>
      </Container>
    </main>
  );
}
