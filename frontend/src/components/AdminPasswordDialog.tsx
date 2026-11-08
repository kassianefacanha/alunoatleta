import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
} from "@mui/material";

interface AdminPasswordDialogProps {
  open: boolean;
  userName: string;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export function AdminPasswordDialog({
  open,
  userName,
  onClose,
  onSubmit,
}: AdminPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  function close() {
    if (saving) return;
    setPassword("");
    setConfirmation("");
    setError("");
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(password);
      setPassword("");
      setConfirmation("");
      setSuccess(true);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <form onSubmit={submit}>
          <DialogTitle>Alterar senha de {userName}</DialogTitle>
          <DialogContent className="admin-editor-fields">
            <p className="admin-dialog-copy">A nova senha precisa ter pelo menos 10 caracteres, usar três tipos de caracteres e não conter partes do nome.</p>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              label="Nova senha"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              inputProps={{ minLength: 10, maxLength: 128 }}
            />
            <TextField
              label="Confirmar nova senha"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              inputProps={{ minLength: 10, maxLength: 128 }}
            />
          </DialogContent>
          <DialogActions className="admin-dialog-actions">
            <Button onClick={close} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving || !password || !confirmation}>
              {saving ? <CircularProgress size={18} color="inherit" /> : "Salvar senha"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Snackbar open={success} autoHideDuration={5000} onClose={() => setSuccess(false)}>
        <Alert severity="success" onClose={() => setSuccess(false)}>Senha atualizada com sucesso.</Alert>
      </Snackbar>
    </>
  );
}
