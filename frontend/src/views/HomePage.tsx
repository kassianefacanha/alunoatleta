import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownwardRounded,
  ArrowForwardRounded,
  AssignmentTurnedInOutlined,
  EmojiEventsRounded,
  Groups2Rounded,
  LocationOnOutlined,
  MenuRounded,
  SchoolOutlined,
  SportsBasketballRounded,
  VerifiedOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Stack,
} from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";
import { modalityColor, ModalityIcon } from "../components/modalityIcons";
import { SectionEyebrow } from "../components/SectionEyebrow";
import { apiGet } from "../services/api";

interface SiteModality {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface PublicSiteContent {
  heroDescription: string;
  methodologyTitle: string;
  methodologyDescription: string;
  modalityTitle: string;
  modalityDescription: string;
  enrollmentTitle: string;
  enrollmentDescription: string;
  footerDescription: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  supportText: string;
  copyrightText: string;
  registrationFormName: string;
  registrationFormUrl: string;
  regulationName: string;
  regulationUrl: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

function publicDocumentUrl(path: string) {
  return path.startsWith("/public/") ? `${API_BASE}${path}` : path;
}

export function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalities, setModalities] = useState<SiteModality[]>([]);
  const [modalitiesError, setModalitiesError] = useState("");
  const [siteContent, setSiteContent] = useState<PublicSiteContent | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiGet<SiteModality[]>("/public/modalities"),
      apiGet<PublicSiteContent>("/public/site-content"),
    ])
      .then(([result, content]) => {
        if (active) {
          setModalities(result);
          setSiteContent(content);
        }
      })
      .catch(() => {
        if (active) setModalitiesError("Não foi possível carregar o conteúdo do site. Tente novamente mais tarde.");
      });
    return () => { active = false; };
  }, []);

  return (
    <main>
      <header className="site-header">
        <Container maxWidth="lg" className="nav-container">
          <Link className="brand-link" to="/" aria-label="Aluno / Atleta — início">
            <BrandLogo className="brand-logo nav-logo" />
          </Link>
          <nav className="desktop-nav" aria-label="Navegação principal">
            <a href="/#projeto">Sobre</a>
            <a href="/#metodologia">Metodologia</a>
            <a href="/#modalidades">Modalidades</a>
            <a href="/#parceiros">Parceiros</a>
            <Button component={Link} to="/login" color="inherit">
              Entrar
            </Button>
            <Button
              component={Link}
              to="/inscricao"
              variant="contained"
              endIcon={<ArrowForwardRounded />}
            >
              Inscreva-se
            </Button>
          </nav>
          <IconButton
            className="mobile-menu-button"
            aria-label="Abrir menu de navegação"
            onClick={() => setMenuOpen(true)}
          >
            <MenuRounded />
          </IconButton>
          <Drawer anchor="right" open={menuOpen} onClose={() => setMenuOpen(false)}>
            <Stack spacing={2} sx={{ width: 270, p: 3, pt: 7 }}>
              <Button component="a" href="/#projeto" onClick={() => setMenuOpen(false)}>
                Sobre
              </Button>
              <Button component="a" href="/#metodologia" onClick={() => setMenuOpen(false)}>
                Metodologia
              </Button>
              <Button component="a" href="/#modalidades" onClick={() => setMenuOpen(false)}>
                Modalidades
              </Button>
              <Button component="a" href="/#parceiros" onClick={() => setMenuOpen(false)}>
                Parceiros
              </Button>
              <Button component={Link} to="/login" onClick={() => setMenuOpen(false)}>
                Entrar
              </Button>
              <Button
                component={Link}
                to="/inscricao"
                variant="contained"
                onClick={() => setMenuOpen(false)}
              >
                Inscreva-se
              </Button>
            </Stack>
          </Drawer>
        </Container>
      </header>

      <section className="hero-band">
      <Container maxWidth="xl">
        <Box component="section" className="hero-section" id="projeto">
          <div className="hero-copy">
            <SectionEyebrow>
              <SchoolOutlined /> EDUCAÇÃO + ESPORTE
            </SectionEyebrow>
            <h1 className="hero-title">
              Onde o esporte
              <br />
              abre as portas da
              <br />
              <span>educação.</span>
            </h1>
            <p className="hero-description">{siteContent?.heroDescription ?? "O Projeto Aluno / Atleta transforma a vida de crianças e jovens do Alto da Mangueira, unindo prática esportiva, desempenho escolar e cidadania. Inscrições abertas para alunos da rede pública."}</p>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} className="hero-actions">
              <Button
                component={Link}
                to="/inscricao"
                variant="contained"
                endIcon={<ArrowForwardRounded />}
              >
                Fazer inscrição
              </Button>
              <Button component="a" href="#metodologia" variant="outlined" color="inherit">
                Conhecer o projeto
              </Button>
            </Stack>
          </div>

          <div className="hero-art" role="img" aria-label="Logo oficial do Projeto Aluno / Atleta">
            <div className="project-poster">
              <span className="poster-corner poster-corner-top" aria-hidden="true" />
              <img src="/projeto-aluno-atleta-hero.png" alt="Arte oficial do Projeto Aluno / Atleta" />
              <span className="poster-corner poster-corner-bottom" aria-hidden="true" />
            </div>
          </div>
        </Box>
      </Container>
      </section>

        <Container maxWidth="xl">
        <Box component="section" className="method-section" id="metodologia">
          <SectionEyebrow>METODOLOGIA</SectionEyebrow>
          <h2>{siteContent?.methodologyTitle ?? "Como o projeto funciona"}</h2>
          <p className="method-intro">{siteContent?.methodologyDescription ?? "Um modelo que conecta sala de aula e quadra, garantindo que o aluno se desenvolva como atleta sem deixar a escola para trás."}</p>
          <div className="method-grid">
            {[
              { icon: <SchoolOutlined />, title: "Alunos da rede pública", text: "Voltado a estudantes inseridos em escolas públicas." },
              { icon: <LocationOnOutlined />, title: "Sede no Alto da Mangueira", text: "Atende alunos e moradores da comunidade." },
              { icon: <SportsBasketballRounded />, title: "4 modalidades com bola", text: "Futsal, basquete, vôlei e handebol." },
              { icon: <VerifiedOutlined />, title: "Avaliações bimestrais", text: "Acompanhamento de desempenho e frequência." },
              { icon: <EmojiEventsRounded />, title: "Formação completa", text: "Equipe preparada para acompanhar cada atleta." },
              { icon: <AssignmentTurnedInOutlined />, title: "Compromisso com presença", text: "Mais que participar: aprender e seguir em frente." },
            ].map((item) => (
              <article className="method-card" key={item.title}>
                <span className="method-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </Box>

        <Box component="section" className="sports-section" id="modalidades">
          <div className="sports-heading">
            <SectionEyebrow>MODALIDADES</SectionEyebrow>
            <h2>{siteContent?.modalityTitle ?? "Esportes oferecidos"}</h2>
            <p>{siteContent?.modalityDescription ?? "Quatro modalidades coletivas trabalhando técnica, disciplina e trabalho em equipe."}</p>
          </div>
          <div className="sports-grid">
            {modalities.map((modality) => (
              <article
                className="sport-card"
                key={modality.id}
                style={{
                  "--modality-background": modalityColor(modality.color).value,
                  "--modality-foreground": modalityColor(modality.color).foreground,
                } as CSSProperties}
              >
                <span><ModalityIcon name={modality.icon} /></span>
                <h3>{modality.name}</h3>
                <p>{modality.description || "Treinos semanais com equipe técnica."}</p>
              </article>
            ))}
            {!modalities.length && !modalitiesError && <p className="sports-empty">As modalidades serão divulgadas em breve.</p>}
          </div>
          {modalitiesError && <Alert severity="error" className="sports-error">{modalitiesError}</Alert>}
          <div className="impact-stats" id="impacto">
            <div><b>~50</b><span>Meninas atendidas</span></div>
            <div><b>~50</b><span>Meninos atendidos</span></div>
            <div><b>+100</b><span>Beneficiários impactados</span></div>
          </div>
        </Box>

        <Box component="section" className="partners-section" id="parceiros">
          <SectionEyebrow>PATROCÍNIO / APOIO</SectionEyebrow>
          <h2>Quem caminha com a gente</h2>
          <p>Instituições que tornam o Projeto Aluno / Atleta possível.</p>
          <div className="partners-grid">
            {[
              { title: "Laboratório de Juventudes", image: "/lab-juv.png", alt: "LAB JUV" },
              { title: "Apoio institucional", image: "/previo.png", alt: "Previo" },
              { title: "Secretaria da Juventude — Governo do Ceará", image: "/sejuv.png", alt: "SEJUV" },
            ].map((partner) => (
              <article className="partner-card" key={partner.title}>
                <div className="partner-wordmark">
                  <img src={partner.image} alt={partner.alt} />
                </div>
                <span>{partner.title}</span>
              </article>
            ))}
          </div>
        </Box>

        <Box component="section" className="enrollment-banner">
          <div className="enrollment-copy">
            <h2>{siteContent?.enrollmentTitle ?? "Inscrições abertas para o Alto da Mangueira"}</h2>
            <p>{siteContent?.enrollmentDescription ?? "A inscrição é gratuita. O aluno deve estudar ou morar no Alto da Mangueira. É necessário anexar foto do atleta e o termo de participação assinado pelo responsável."}</p>
            <div className="enrollment-actions">
              <Button component={Link} to="/inscricao" variant="contained" endIcon={<ArrowForwardRounded />}>Iniciar inscrição</Button>
              <Button component="a" href={publicDocumentUrl(siteContent?.registrationFormUrl ?? "/ficha-inscricao.pdf")} download variant="outlined" startIcon={<AssignmentTurnedInOutlined />}>Baixar ficha</Button>
              {siteContent?.regulationUrl && <Button component="a" href={publicDocumentUrl(siteContent.regulationUrl)} download variant="outlined">Baixar regulamento</Button>}
            </div>
          </div>
          <div className="enrollment-steps">
            {["Preencha os dados do aluno", "Envie a foto do atleta", "Baixe e assine o termo", "Anexe o termo assinado"].map((item, index) => (
              <div key={item}><Groups2Rounded /><span>{`0${index + 1}`}</span><p>{item}</p></div>
            ))}
          </div>
          <ArrowDownwardRounded className="enrollment-watermark" />
        </Box>
      </Container>

      <footer className="site-footer">
        <Container maxWidth="xl" className="footer-inner">
          <div className="footer-brand">
            <BrandLogo className="brand-logo footer-logo" />
            <p>{siteContent?.footerDescription ?? "Educação e esporte caminhando juntos para transformar a juventude do Alto da Mangueira."}</p>
          </div>
          <div className="footer-contact">
            <h2>Contato</h2>
            <a href={`mailto:${siteContent?.contactEmail ?? "projetoalunoatleta@gmail.com"}`}>{siteContent?.contactEmail ?? "projetoalunoatleta@gmail.com"}</a>
            <a href={`tel:${(siteContent?.contactPhone ?? "(85) 99182-3661").replace(/[^\d+]/g, "")}`}>{siteContent?.contactPhone ?? "(85) 99182-3661"}</a>
            <span>{siteContent?.contactAddress ?? "Alto da Mangueira"}</span>
          </div>
          <div className="footer-support">
            <h2>Apoio</h2>
            <span>{siteContent?.supportText ?? "LAB JUV · Previo · SEJUV — Governo do Estado do Ceará"}</span>
          </div>
          <div className="footer-legal"><Link to="/login">Entrar</Link><Link to="/termos">Termo de inscrição</Link><Link to="/privacidade">Privacidade</Link><span>{siteContent?.copyrightText ?? "© 2026 Projeto Aluno / Atleta. Todos os direitos reservados."}</span></div>
        </Container>
      </footer>
    </main>
  );
}
