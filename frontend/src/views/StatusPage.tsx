import { Link } from "react-router-dom";
import { ArrowBackRounded, HourglassTopRounded, VerifiedRounded } from "@mui/icons-material";
import { Button, Container } from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";

export function StatusPage() {
  const hasSubmitted = sessionStorage.getItem("registration-submitted") === "true";

  return (
    <main className="status-page">
      <Link to="/" className="status-brand"><BrandLogo className="brand-logo nav-logo" /></Link>
      <Container maxWidth="sm">
        <section className="status-card">
          <span className={`status-illustration ${hasSubmitted ? "status-pending" : "status-search"}`}>
            {hasSubmitted ? <HourglassTopRounded /> : <VerifiedRounded />}
          </span>
          <span className="section-eyebrow">{hasSubmitted ? "INSCRIÇÃO RECEBIDA" : "ACOMPANHE POR AQUI"}</span>
          <h1>{hasSubmitted ? "Sua inscrição está em análise." : "Confira sua inscrição."}</h1>
          <p>
            {hasSubmitted
              ? "Nossa equipe recebeu seus dados e está avaliando sua inscrição. Acompanhe seu e-mail: avisaremos você assim que houver novidades."
              : "Depois de preencher o formulário, nossa equipe vai avaliar sua inscrição e avisar você por e-mail."}
          </p>
          <div className="status-explainer"><span>1</span> Análise dos seus dados <span>2</span> Notificação por e-mail <span>3</span> Próximos passos</div>
          <Button component={Link} to="/" variant="contained" fullWidth startIcon={<ArrowBackRounded />}>Voltar ao início</Button>
          <Link className="status-login" to="/login">Já tenho uma conta</Link>
        </section>
      </Container>
    </main>
  );
}
