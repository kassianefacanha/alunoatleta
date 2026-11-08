import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField } from "@mui/material";
import { adminRequest } from "../services/admin";

interface AuditActor {
  fullName: string;
  email: string;
}

interface SystemLog {
  _id: string;
  actorId: AuditActor | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  at: string;
  metadata?: Record<string, unknown>;
}

interface SystemLogPage {
  rows: SystemLog[];
  total: number;
  page: number;
  pageSize: number;
}

interface Filters {
  search: string;
  action: string;
  resourceType: string;
  ip: string;
  from: string;
  to: string;
}

const emptyFilters: Filters = { search: "", action: "", resourceType: "", ip: "", from: "", to: "" };

export function SystemLogsPage({ token }: { token: string }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [result, setResult] = useState<SystemLogPage>({ rows: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async (page: number, current: Filters) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    for (const [key, value] of Object.entries(current)) {
      if (value) params.set(key, value);
    }
    try {
      setResult(await adminRequest<SystemLogPage>(`/audit?${params.toString()}`, token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os logs.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadLogs(1, emptyFilters); }, [loadLogs]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadLogs(1, filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    void loadLogs(1, emptyFilters);
  }

  return (
    <div className="admin-logs-page">
      <header className="admin-management-heading">
        <div><h1>Log do sistema</h1><p>Trilha de auditoria somente para consulta, com filtros por usuário, ação, entidade, período e IP.</p></div>
        <Button variant="outlined" onClick={() => void loadLogs(result.page, appliedFilters)}>Atualizar</Button>
      </header>
      {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
      <form className="admin-panel admin-log-filters" onSubmit={applyFilters}>
        <TextField label="Buscar ação, entidade, IP ou usuário" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} size="small" />
        <TextField label="Ação" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} size="small" />
        <TextField label="Entidade" value={filters.resourceType} onChange={(event) => setFilters({ ...filters, resourceType: event.target.value })} size="small" />
        <TextField label="IP" value={filters.ip} onChange={(event) => setFilters({ ...filters, ip: event.target.value })} size="small" />
        <TextField label="Data inicial" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Data final" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <div className="admin-log-filter-actions">
          <Button type="submit" variant="contained">Aplicar filtros</Button>
          <Button type="button" onClick={clearFilters}>Limpar</Button>
        </div>
      </form>
      <section className="admin-panel admin-log-table-panel">
        <div className="admin-panel-heading">
          <div><h2>Eventos registrados</h2><p>{result.total} {result.total === 1 ? "evento" : "eventos"}</p></div>
        </div>
        {loading ? (
          <div className="admin-loading" role="status"><CircularProgress size={24} /><span>Carregando logs...</span></div>
        ) : result.rows.length ? (
          <>
            <TableContainer className="admin-log-table-scroll">
              <Table size="small" aria-label="Log de auditoria do sistema">
                <TableHead><TableRow>
                  <TableCell>Data e hora</TableCell><TableCell>Ator</TableCell><TableCell>Ação</TableCell>
                  <TableCell>Entidade</TableCell><TableCell>IP</TableCell><TableCell>Detalhes</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow key={row._id} hover>
                      <TableCell>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.at))}</TableCell>
                      <TableCell>{row.actorId ? <>{row.actorId.fullName}<small className="admin-log-secondary">{row.actorId.email}</small></> : "Conta removida"}</TableCell>
                      <TableCell><code>{row.action}</code></TableCell>
                      <TableCell>{row.resourceType}<small className="admin-log-secondary">{row.resourceId ?? "—"}</small></TableCell>
                      <TableCell>{row.ip ?? "—"}</TableCell>
                      <TableCell>
                        {row.metadata && Object.keys(row.metadata).length
                          ? <details className="admin-log-details"><summary>Ver detalhes</summary><pre>{JSON.stringify(row.metadata, null, 2)}</pre></details>
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={result.total}
              page={result.page - 1}
              rowsPerPage={result.pageSize}
              rowsPerPageOptions={[20]}
              onPageChange={(_event, page) => void loadLogs(page + 1, appliedFilters)}
              onRowsPerPageChange={() => undefined}
              labelRowsPerPage="Eventos por página"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </>
        ) : <div className="admin-management-empty">Nenhum evento corresponde aos filtros.</div>}
      </section>
    </div>
  );
}
