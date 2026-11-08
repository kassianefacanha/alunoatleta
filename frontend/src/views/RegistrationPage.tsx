import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowBackRounded,
  ArrowForwardRounded,
  CheckCircleOutlineRounded,
  CloudUploadOutlined,
  DescriptionOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";
import { apiGet, apiRequest, uploadFile } from "../services/api";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

function publicDocumentUrl(path: string) {
  return path.startsWith("/public/") ? `${API_BASE}${path}` : path;
}

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  birthDate: "",
  age: "",
  gender: "",
  classId: "",
  school: "",
  neighborhood: "Alto da Mangueira",
  city: "Maracanaú",
  street: "",
  number: "",
  complement: "",
  guardianName: "",
  guardianPhone: "",
};

interface RegistrationOption {
  id: string;
  name: string;
  modality: string;
  remainingSpots: number;
  registrationEndsAt: string;
  requirements: string[];
}

interface RegistrationSiteContent {
  termsVersion: string;
  registrationFormName: string;
  registrationFormUrl: string;
}

export function RegistrationPage() {
  const [form, setForm] = useState(initialForm);
  const [registrationOptions, setRegistrationOptions] = useState<RegistrationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [siteContent, setSiteContent] = useState<RegistrationSiteContent>({
    termsVersion: "1.0",
    registrationFormName: "Ficha de inscrição (PDF)",
    registrationFormUrl: "/ficha-inscricao.pdf",
  });
  const [optionsError, setOptionsError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [signedForm, setSignedForm] = useState<File | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedRequirements, setConfirmedRequirements] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const selectedOption = registrationOptions.find((option) => option.id === form.classId);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiGet<RegistrationOption[]>("/auth/registration-options"),
      apiGet<RegistrationSiteContent>("/public/site-content"),
    ])
      .then(([options, content]) => {
        if (active) {
          setRegistrationOptions(options);
          setSiteContent(content);
        }
      })
      .catch((reason: unknown) => {
        if (active) setOptionsError(reason instanceof Error ? reason.message : "Não foi possível carregar as turmas.");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateField(field: keyof typeof initialForm, value: string) {
    if (field === "classId") setConfirmedRequirements(false);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validateUpload(file: File, kind: "photo" | "document"): string | null {
    const validTypes = kind === "photo"
      ? ["image/jpeg", "image/png"]
      : ["application/pdf"];
    if (!validTypes.includes(file.type)) {
      return kind === "photo"
        ? "Envie uma imagem JPG ou PNG."
        : "Envie o documento assinado em formato PDF.";
    }
    if (file.size > 5 * 1024 * 1024) return "O arquivo deve ter no máximo 5 MB.";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!registrationOptions.some((option) => option.id === form.classId)) {
      setError("Selecione uma turma com inscrições abertas e vagas disponíveis.");
      return;
    }
    if (form.password.length < 10) {
      setError("A senha precisa ter pelo menos 10 caracteres.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("A senha e a confirmação precisam ser iguais.");
      return;
    }
    if ([/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(form.password)).length < 3) {
      setError("Escolha uma senha mais segura, com letras, números e símbolos.");
      return;
    }
    if (!photo || !signedForm) {
      setError("Anexe sua foto e a ficha de inscrição assinada para continuar.");
      return;
    }
    const photoError = validateUpload(photo, "photo");
    const documentError = validateUpload(signedForm, "document");
    if (photoError || documentError) {
      setError(photoError ?? documentError ?? "Verifique os arquivos anexados.");
      return;
    }
    if (!acceptedTerms) {
      setError("Para se inscrever, leia e aceite os termos e a política de privacidade.");
      return;
    }
    if (selectedOption?.requirements.length && !confirmedRequirements) {
      setError("Confirme que leu os requisitos da turma antes de enviar a inscrição.");
      return;
    }
    setBusy(true);
    try {
      const [studentPhotoKey, signedFormPdfKey] = await Promise.all([
        uploadFile(photo, "studentPhoto"),
        uploadFile(signedForm, "signedFormPdf"),
      ]);
      await apiRequest("/auth/register", {
        ...Object.fromEntries(
          Object.entries(form).filter(([key]) => key !== "confirmPassword"),
        ),
        age: Number(form.age),
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: siteContent.termsVersion,
        consent: acceptedTerms,
        eligibilityConfirmed: confirmedRequirements,
        studentPhotoKey,
        signedFormPdfKey,
      });
      sessionStorage.setItem("registration-submitted", "true");
      navigate("/inscricao/status");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível enviar sua inscrição. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="registration-page">
      <header className="registration-header">
        <Link to="/" className="brand-link" aria-label="Voltar à página inicial">
          <BrandLogo className="brand-logo nav-logo" />
        </Link>
        <Link to="/" className="registration-back">
          <ArrowBackRounded fontSize="small" /> Voltar ao site
        </Link>
      </header>
      <div className="registration-layout">
        <aside className="registration-aside">
          <span className="registration-eyebrow">JOGAR TAMBÉM É APRENDER</span>
          <h1>Seu lugar<br />também é<br /><span>em campo.</span></h1>
          <p>Preencha o formulário com a ajuda do seu responsável. Nossa equipe vai receber seus dados para avaliar sua inscrição.</p>
          <div className="aside-promise">
            <CheckCircleOutlineRounded />
            <span><b>Sem pressa, no seu tempo.</b><small>Você pode conferir cada informação antes de enviar.</small></span>
          </div>
          <div className="registration-watermark"><span>AA</span> NOVAS OPORTUNIDADES COMEÇAM AQUI</div>
        </aside>
        <section className="registration-card" aria-labelledby="register-title">
          <div className="registration-card-brand">
            <Link to="/" aria-label="Voltar à página inicial">
              <BrandLogo className="brand-logo registration-form-logo" />
            </Link>
          </div>
          <Tabs value={1} variant="fullWidth" aria-label="Entrar ou inscrever-se" className="auth-tabs registration-tabs">
            <Tab label="Entrar" component={Link} to="/login" />
            <Tab label="Inscrever-se" />
          </Tabs>
          <div className="registration-card-heading">
            <span className="form-step">SUA INSCRIÇÃO <span>01 / 01</span></span>
            <h2 id="register-title">Termo de inscrição</h2>
            <p>Quer fazer parte do nosso time? Vamos começar com alguns dados.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="document-reminder">
              <span className="document-icon"><DescriptionOutlined /></span>
              <span className="document-copy"><b>Antes de começar, prepare a ficha</b><small>Imprima, peça a assinatura do responsável e anexe abaixo.</small></span>
              <Button
                component="a"
                href={publicDocumentUrl(siteContent.registrationFormUrl)}
                download
                size="small"
              >
                Baixar PDF
              </Button>
            </div>
            <fieldset className="form-fieldset">
              <legend>Dados de acesso</legend>
              <div className="form-grid">
                <TextField
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@email.com"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
                <TextField
                  label="Nome completo"
                  autoComplete="name"
                  required
                  placeholder="Nome do aluno"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                />
                <TextField
                  label="Senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
                  placeholder="Mínimo de 10 caracteres"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  helperText="Combine letras maiúsculas, minúsculas, números e símbolos."
                />
                <TextField
                  label="Confirmar senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Digite novamente a senha"
                  value={form.confirmPassword}
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                />
                <TextField
                  label="Nascimento"
                  type="date"
                  required
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.birthDate}
                  onChange={(event) => updateField("birthDate", event.target.value)}
                />
                <TextField
                  label="Idade"
                  type="number"
                  required
                  slotProps={{ htmlInput: { min: 4, max: 99 } }}
                  placeholder="Ex.: 12"
                  value={form.age}
                  onChange={(event) => updateField("age", event.target.value)}
                />
                <TextField
                  label="Gênero"
                  select
                  required
                  value={form.gender}
                  onChange={(event) => updateField("gender", event.target.value)}
                >
                  {["Feminino", "Masculino", "Outro", "Prefiro não informar"].map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Turma disponível"
                  select
                  required
                  disabled={loadingOptions || registrationOptions.length === 0}
                  value={form.classId}
                  onChange={(event) => updateField("classId", event.target.value)}
                  helperText={loadingOptions
                    ? "Carregando turmas disponíveis..."
                    : optionsError || (selectedOption
                      ? `Inscrições até ${new Date(selectedOption.registrationEndsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
                      : registrationOptions.length
                        ? "Selecione uma turma para consultar o encerramento das inscrições."
                        : "Não há vagas disponíveis ou as inscrições estão encerradas no momento.")}
                >
                  {registrationOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.name} · {option.modality} · {option.remainingSpots} {option.remainingSpots === 1 ? "vaga" : "vagas"}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Escola"
                  required
                  placeholder="Nome da escola onde estuda"
                  value={form.school}
                  onChange={(event) => updateField("school", event.target.value)}
                />
              </div>
            </fieldset>
            {selectedOption?.requirements.length ? (
              <Alert severity="info" className="registration-eligibility">
                <b>Requisitos para esta turma</b>
                <ul>{selectedOption.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
                <FormControlLabel
                  control={<Checkbox checked={confirmedRequirements} onChange={(event) => setConfirmedRequirements(event.target.checked)} />}
                  label="Confirmo que li os requisitos da turma."
                />
              </Alert>
            ) : null}
            <fieldset className="form-fieldset">
              <legend>Endereço</legend>
              <div className="form-grid">
                <TextField label="Bairro" required value={form.neighborhood} onChange={(event) => updateField("neighborhood", event.target.value)} />
                <TextField label="Cidade" required value={form.city} onChange={(event) => updateField("city", event.target.value)} />
                <TextField label="Rua / endereço" required placeholder="Rua onde mora" value={form.street} onChange={(event) => updateField("street", event.target.value)} />
                <TextField label="Número" required placeholder="Nº" value={form.number} onChange={(event) => updateField("number", event.target.value)} />
                <TextField label="Complemento" placeholder="Bloco, casa..." value={form.complement} onChange={(event) => updateField("complement", event.target.value)} />
              </div>
            </fieldset>
            <fieldset className="form-fieldset">
              <legend>Responsável</legend>
              <div className="form-grid">
                <TextField label="Nome do responsável" autoComplete="name" required value={form.guardianName} onChange={(event) => updateField("guardianName", event.target.value)} />
                <TextField
                  label="Telefone do responsável"
                  autoComplete="tel"
                  type="tel"
                  required
                  placeholder="(85) 99999-9999"
                  slotProps={{ htmlInput: { maxLength: 15 } }}
                  value={form.guardianPhone}
                  onChange={(event) => updateField("guardianPhone", event.target.value.replace(/[^\d ()-]/g, ""))}
                />
              </div>
            </fieldset>
            <fieldset className="form-fieldset">
              <legend>Documentos</legend>
              <Stack spacing={1.4}>
                <label className="upload-field" htmlFor="student-photo">
                  <span className="upload-icon"><CloudUploadOutlined /></span>
                  <span className="upload-copy"><b>Foto do aluno</b><small>{photo ? photo.name : "JPG ou PNG · até 5 MB"}</small></span>
                  <span className="upload-action">{photo ? "Alterar" : "Anexar"}</span>
                  <input id="student-photo" type="file" accept="image/jpeg,image/png" hidden onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
                </label>
                <label className="upload-field" htmlFor="signed-form">
                  <span className="upload-icon"><DescriptionOutlined /></span>
                  <span className="upload-copy"><b>Ficha assinada pelo responsável</b><small>{signedForm ? signedForm.name : "PDF · até 5 MB"}</small></span>
                  <span className="upload-action">{signedForm ? "Alterar" : "Anexar"}</span>
                  <input id="signed-form" type="file" accept="application/pdf" hidden onChange={(event) => setSignedForm(event.target.files?.[0] ?? null)} />
                </label>
              </Stack>
              <small className="upload-privacy">Seus documentos ficam protegidos e só são acessados pela equipe de avaliação.</small>
            </fieldset>
            <div className="consent-box">
              <FormControlLabel
                control={<Checkbox checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required size="small" />}
                label={<span>Li e aceito os <Link to="/termos">Termos de Inscrição</Link> e a <Link to="/privacidade">Política de Privacidade</Link>.</span>}
              />
            </div>
            {optionsError && <Alert severity="error" sx={{ mt: 2 }}>{optionsError}</Alert>}
            {!loadingOptions && !optionsError && registrationOptions.length === 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>No momento, não há vagas disponíveis ou as inscrições estão encerradas. Tente novamente mais tarde.</Alert>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button
              className="registration-submit"
              type="submit"
              variant="contained"
              fullWidth
              disabled={busy || loadingOptions || registrationOptions.length === 0 || Boolean(optionsError)}
              endIcon={<ArrowForwardRounded />}
            >
              {busy ? "Enviando inscrição..." : "Enviar inscrição"}
            </Button>
            <p className="form-submit-note">Seus dados são tratados com cuidado e usados apenas para sua inscrição.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
