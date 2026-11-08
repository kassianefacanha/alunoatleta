import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowBackRounded,
  ArrowForwardRounded,
  KeyRounded,
  LockOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";
import { apiRequest } from "../services/api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { accessToken, user } = await apiRequest<{
        accessToken: string;
        user: { role: string; fullName: string };
      }>("/auth/login", {
        email,
        password,
      });
      localStorage.setItem("aluno-atleta-token", accessToken);
      localStorage.setItem("aluno-atleta-role", user.role);
      localStorage.setItem("aluno-atleta-name", user.fullName);
      navigate("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    setRequestBusy(true);
    try {
      await apiRequest<{ message: string }>("/auth/password-reset-requests", {
        fullName: requestName,
        email: requestEmail,
      });
      setRequestSent(true);
      setRequestName("");
      setRequestEmail("");
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : "Não foi possível enviar a solicitação.");
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-back">
        <ArrowBackRounded fontSize="small" /> Voltar ao site
      </Link>
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-heading">
          <Link to="/" aria-label="Voltar à página inicial">
            <BrandLogo className="brand-logo auth-logo" />
          </Link>
          <h1 className="visually-hidden" id="login-title">Entrar na área do Aluno / Atleta</h1>
        </div>
        <Tabs
          value={0}
          variant="fullWidth"
          aria-label="Entrar ou fazer uma inscrição"
          className="auth-tabs"
        >
          <Tab label="Entrar" />
          <Tab label="Inscrever-se" component={Link} to="/inscricao" />
        </Tabs>
        <Box component="form" onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="login-email">E-mail</label>
          <TextField
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="field-label-row">
            <label htmlFor="login-password">Senha</label>
            <Link className="forgot-link" to="/inscricao/status">Acompanhar inscrição</Link>
          </div>
          <TextField
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowPassword((visible) => !visible)}
                      edge="end"
                    >
                      {showPassword
                        ? <VisibilityOffOutlined fontSize="small" />
                        : <VisibilityOutlined fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={busy || !email || !password}
            endIcon={!busy && <ArrowForwardRounded />}
          >
            {busy ? "Entrando..." : "Entrar"}
          </Button>
          <div className="login-note">
            <span className="secure-icon"><LockOutlined fontSize="small" /></span>
            Professores recebem login criado pela coordenação.
          </div>
          <Button
            type="button"
            className="login-password-request"
            variant="text"
            size="small"
            startIcon={<KeyRounded />}
            onClick={() => { setRequestOpen(true); setRequestSent(false); setRequestError(""); }}
          >
            Solicitar troca de senha
          </Button>
        </Box>
      </section>
      <p className="auth-copyright">Um projeto feito para crescer junto. <span>♥</span></p>
      <Dialog open={requestOpen} onClose={() => !requestBusy && setRequestOpen(false)} fullWidth maxWidth="xs">
        {requestSent ? (
          <>
            <DialogTitle>Solicitação enviada</DialogTitle>
            <DialogContent>
              <Alert severity="success">Se os dados corresponderem a uma conta de aluno ativa, a administração receberá a solicitação. A equipe confirmará sua identidade antes de alterar a senha.</Alert>
            </DialogContent>
            <DialogActions><Button onClick={() => setRequestOpen(false)}>Fechar</Button></DialogActions>
          </>
        ) : (
          <Box component="form" onSubmit={submitPasswordRequest}>
            <DialogTitle>Solicitar troca de senha</DialogTitle>
            <DialogContent className="admin-editor-fields">
              <p className="admin-dialog-copy">Informe o nome e o e-mail cadastrados. A administração confirmará sua identidade antes de redefinir a senha.</p>
              {requestError && <Alert severity="error">{requestError}</Alert>}
              <TextField autoFocus label="Nome completo do aluno" value={requestName} onChange={(event) => setRequestName(event.target.value)} required inputProps={{ maxLength: 140 }} />
              <TextField label="E-mail cadastrado" type="email" autoComplete="email" value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} required inputProps={{ maxLength: 254 }} />
            </DialogContent>
            <DialogActions className="admin-dialog-actions">
              <Button onClick={() => setRequestOpen(false)} disabled={requestBusy}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={requestBusy || !requestName.trim() || !requestEmail.trim()}>
                {requestBusy ? "Enviando..." : "Enviar solicitação"}
              </Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </main>
  );
}
