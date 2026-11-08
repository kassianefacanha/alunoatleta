import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, CircularProgress, TextField } from "@mui/material";
import { adminRequest } from "../services/admin";

interface SiteDocument {
  key: string;
  name: string;
}

interface SiteContent {
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
  termsVersion: string;
  termsUpdatedAt: string;
  termsContent: string;
  privacyContent: string;
  registrationForm: SiteDocument | null;
  regulation: SiteDocument | null;
}

interface UploadUrl {
  key: string;
  uploadUrl: string;
}

const fields: Array<{
  key: keyof Pick<SiteContent, "heroDescription" | "methodologyTitle" | "methodologyDescription" | "modalityTitle" | "modalityDescription" | "enrollmentTitle" | "enrollmentDescription" | "footerDescription" | "contactEmail" | "contactPhone" | "contactAddress" | "supportText" | "copyrightText" | "termsVersion" | "termsContent" | "privacyContent">;
  label: string;
  maxLength: number;
  multiline?: boolean;
  rows?: number;
  type?: string;
  group: string;
}> = [
  { key: "heroDescription", label: "Texto de apresentação (capa)", maxLength: 1200, multiline: true, rows: 3, group: "Página inicial" },
  { key: "methodologyTitle", label: "Título da metodologia", maxLength: 120, group: "Página inicial" },
  { key: "methodologyDescription", label: "Descrição da metodologia", maxLength: 1200, multiline: true, rows: 3, group: "Página inicial" },
  { key: "modalityTitle", label: "Título das modalidades", maxLength: 120, group: "Página inicial" },
  { key: "modalityDescription", label: "Descrição das modalidades", maxLength: 1200, multiline: true, rows: 3, group: "Página inicial" },
  { key: "enrollmentTitle", label: "Título do bloco de inscrição", maxLength: 160, group: "Página inicial" },
  { key: "enrollmentDescription", label: "Texto do bloco de inscrição", maxLength: 1200, multiline: true, rows: 3, group: "Página inicial" },
  { key: "footerDescription", label: "Apresentação no rodapé", maxLength: 600, multiline: true, rows: 2, group: "Página inicial" },
  { key: "contactEmail", label: "E-mail de contato", maxLength: 254, type: "email", group: "Contato e apoio" },
  { key: "contactPhone", label: "Telefone de contato", maxLength: 40, group: "Contato e apoio" },
  { key: "contactAddress", label: "Endereço / localização", maxLength: 200, group: "Contato e apoio" },
  { key: "supportText", label: "Instituições de apoio", maxLength: 500, multiline: true, rows: 2, group: "Contato e apoio" },
  { key: "copyrightText", label: "Texto de direitos autorais", maxLength: 300, group: "Contato e apoio" },
  { key: "termsVersion", label: "Versão publicada", maxLength: 24, group: "Termos e privacidade" },
  { key: "termsContent", label: "Termos de inscrição", maxLength: 20000, multiline: true, rows: 12, group: "Termos e privacidade" },
  { key: "privacyContent", label: "Política de privacidade", maxLength: 20000, multiline: true, rows: 12, group: "Termos e privacidade" },
];

async function uploadPdf(token: string, kind: "registration-form" | "regulation", file: File): Promise<SiteDocument> {
  const signed = await adminRequest<UploadUrl>("/admin/site-content/upload-url", token, "POST", {
    kind,
    fileName: file.name,
  });
  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!response.ok) throw new Error("Não foi possível enviar o PDF ao armazenamento.");
  return { key: signed.key, name: file.name };
}

export function AdminContentPage({ token }: { token: string }) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"registration-form" | "regulation" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    adminRequest<SiteContent>("/admin/site-content", token)
      .then((result) => { if (active) setContent(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o conteúdo do site.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function updateField(key: keyof SiteContent, value: string) {
    setContent((current) => current ? { ...current, [key]: value } : current);
    setSuccess("");
  }

  async function chooseDocument(kind: "registration-form" | "regulation", file?: File) {
    if (!content || !file) return;
    setError("");
    setSuccess("");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    if (file.size === 0 || file.size > 15 * 1024 * 1024) {
      setError("O arquivo deve ter até 15 MB.");
      return;
    }
    setUploading(kind);
    try {
      const document = await uploadPdf(token, kind, file);
      setContent((current) => current
        ? { ...current, [kind === "registration-form" ? "registrationForm" : "regulation"]: document }
        : current);
      setSuccess(`${file.name} enviado. Salve as alterações para publicar o documento.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o documento.");
    } finally {
      setUploading(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const {
      termsUpdatedAt: _termsUpdatedAt,
      ...payload
    } = content;
    try {
      const result = await adminRequest<{ message: string; termsUpdatedAt: string }>(
        "/admin/site-content",
        token,
        "PATCH",
        payload,
      );
      setContent((current) => current ? { ...current, termsUpdatedAt: result.termsUpdatedAt } : current);
      setSuccess("Conteúdo publicado no site.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível publicar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  const groups = [...new Set(fields.map(({ group }) => group))];

  return (
    <div className="admin-content-editor">
      <header className="admin-management-heading">
        <div>
          <h1>Controle de conteúdo</h1>
          <p>Edite os textos públicos, contatos, termos e documentos do projeto.</p>
        </div>
      </header>
      {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
      {success && <Alert severity="success" className="admin-alert">{success}</Alert>}
      {loading ? (
        <div className="admin-loading" role="status"><CircularProgress size={26} /><span>Carregando conteúdo...</span></div>
      ) : content ? (
        <form className="admin-content-form" onSubmit={(event) => void save(event)}>
          {groups.map((group) => (
            <section className="admin-panel admin-content-section" key={group}>
              <div className="admin-panel-heading">
                <div>
                  <h2>{group}</h2>
                  {group === "Termos e privacidade" && (
                    <p>Use linhas em branco para separar seções. Ao alterar os documentos, publique uma nova versão.</p>
                  )}
                </div>
              </div>
              <div className="admin-content-fields">
                {fields.filter((field) => field.group === group).map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    type={field.type ?? "text"}
                    value={content[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    required
                    fullWidth
                    multiline={field.multiline}
                    minRows={field.rows}
                    slotProps={{ htmlInput: { maxLength: field.maxLength } }}
                    helperText={`${String(content[field.key]).length}/${field.maxLength}`}
                  />
                ))}
              </div>
              {group === "Termos e privacidade" && (
                <p className="admin-content-updated">
                  Última alteração legal: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(content.termsUpdatedAt))}
                </p>
              )}
            </section>
          ))}
          <section className="admin-panel admin-content-section">
            <div className="admin-panel-heading">
              <div><h2>Arquivos públicos</h2><p>Envie PDFs de até 15 MB. A ficha é usada também no formulário de inscrição.</p></div>
            </div>
            <div className="admin-content-files">
              <DocumentField
                title="Ficha de inscrição"
                document={content.registrationForm}
                uploading={uploading === "registration-form"}
                onSelect={(file) => void chooseDocument("registration-form", file)}
                onRemove={() => setContent((current) => current ? { ...current, registrationForm: null } : current)}
                removeLabel="Usar ficha padrão do site"
              />
              <DocumentField
                title="Regulamento"
                document={content.regulation}
                uploading={uploading === "regulation"}
                onSelect={(file) => void chooseDocument("regulation", file)}
                onRemove={() => setContent((current) => current ? { ...current, regulation: null } : current)}
                removeLabel="Remover regulamento publicado"
              />
            </div>
          </section>
          <div className="admin-content-save">
            <span>As alterações são publicadas após salvar. Mudanças em termos e privacidade exigem nova versão.</span>
            <Button type="submit" variant="contained" disabled={saving || Boolean(uploading)}>
              {saving ? "Publicando..." : "Salvar e publicar"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DocumentField({
  title,
  document,
  uploading,
  onSelect,
  onRemove,
  removeLabel,
}: {
  title: string;
  document: SiteDocument | null;
  uploading: boolean;
  onSelect: (file?: File) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="admin-content-document">
      <div><h3>{title}</h3><span>{document?.name ?? "Nenhum PDF personalizado"}</span></div>
      <div className="admin-content-document-actions">
        <Button component="label" variant="outlined" disabled={uploading}>
          {uploading ? "Enviando..." : "Escolher PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              onSelect(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </Button>
        {document && <Button type="button" color="error" onClick={onRemove}>{removeLabel}</Button>}
      </div>
    </div>
  );
}
