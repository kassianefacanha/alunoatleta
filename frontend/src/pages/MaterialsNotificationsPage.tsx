import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography
} from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest, uploadMaterialFile } from '../lib/api';

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
  studentIds: string[];
}

interface MaterialRecord {
  _id: string;
  classId: string;
  title: string;
  body?: string;
  url?: string;
  fileKey?: string;
  fileName?: string;
  createdAt: string;
}

interface NotificationRecord {
  _id: string;
  classId?: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function MaterialsNotificationsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"student"}') as { email: string; role: string };
  const canPublish = user.role === 'admin' || user.role === 'teacher';
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [filterClassId, setFilterClassId] = useState('');
  const [materialClassId, setMaterialClassId] = useState('');
  const [notificationClassId, setNotificationClassId] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialBody, setMaterialBody] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [savingNotification, setSavingNotification] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [downloadingMaterialId, setDownloadingMaterialId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData(classId = filterClassId) {
    setLoading(true);
    setError('');
    try {
      const materialQuery = classId ? `?classId=${encodeURIComponent(classId)}` : '';
      const [classResult, materialResult, notificationResult] = await Promise.all([
        apiRequest<{ classes: SportsClass[] }>('/classes'),
        apiRequest<{ materials: MaterialRecord[] }>(`/materials${materialQuery}`),
        apiRequest<{ notifications: NotificationRecord[] }>('/notifications')
      ]);
      setClasses(classResult.classes);
      setMaterials(materialResult.materials);
      setNotifications(notificationResult.notifications);
      if (classResult.classes.length) {
        setMaterialClassId((current) => current || classResult.classes[0]._id);
        setNotificationClassId((current) => current || classResult.classes[0]._id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar materiais e avisos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData('');
  }, []);

  async function applyClassFilter(classId: string) {
    setFilterClassId(classId);
    await loadData(classId);
  }

  async function publishMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!materialClassId) return;
    setSavingMaterial(true);
    setError('');
    setNotice('');
    try {
      const uploadedFile = materialFile ? await uploadMaterialFile(materialFile, materialClassId) : undefined;
      await apiRequest('/materials', {
        method: 'POST',
        body: JSON.stringify({
          classId: materialClassId,
          title: materialTitle.trim(),
          ...(materialBody.trim() ? { body: materialBody.trim() } : {}),
          ...(materialUrl.trim() ? { url: materialUrl.trim() } : {}),
          ...(uploadedFile ? { fileKey: uploadedFile.key, fileName: uploadedFile.fileName } : {})
        })
      });
      setMaterialTitle('');
      setMaterialBody('');
      setMaterialUrl('');
      setMaterialFile(null);
      setMaterialDialogOpen(false);
      setNotice('Material publicado para a turma.');
      await loadData(filterClassId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível publicar o material.');
    } finally {
      setSavingMaterial(false);
    }
  }

  async function publishNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notificationClassId) return;
    setSavingNotification(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ sent: number }>('/notifications', {
        method: 'POST',
        body: JSON.stringify({
          classId: notificationClassId,
          title: notificationTitle.trim(),
          message: notificationMessage.trim()
        })
      });
      setNotificationTitle('');
      setNotificationMessage('');
      setNotificationDialogOpen(false);
      setNotice(result.sent
        ? `Aviso enviado para ${result.sent} ${result.sent === 1 ? 'aluno' : 'alunos'}.`
        : 'Aviso registrado, mas a turma ainda não possui alunos vinculados.');
      await loadData(filterClassId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o aviso.');
    } finally {
      setSavingNotification(false);
    }
  }

  async function markAsRead(notification: NotificationRecord) {
    setMarkingReadId(notification._id);
    setError('');
    try {
      const result = await apiRequest<{ notification: NotificationRecord }>(`/notifications/${notification._id}/read`, {
        method: 'PATCH'
      });
      setNotifications((current) => current.map((item) =>
        item._id === notification._id ? result.notification : item
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o aviso.');
    } finally {
      setMarkingReadId(null);
    }
  }

  async function downloadMaterial(material: MaterialRecord) {
    const downloadWindow = window.open('about:blank', '_blank');
    if (!downloadWindow) {
      setError('Permita a abertura de uma nova aba para baixar o material.');
      return;
    }
    downloadWindow.opener = null;
    setDownloadingMaterialId(material._id);
    setError('');
    try {
      const result = await apiRequest<{ downloadUrl: string }>(`/uploads/materials/${material._id}/download`);
      downloadWindow.location.href = result.downloadUrl;
    } catch (reason) {
      downloadWindow.close();
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar o material.');
    } finally {
      setDownloadingMaterialId(null);
    }
  }

  const className = (id?: string) => classes.find((sportsClass) => sportsClass._id === id)?.name ?? 'Turma';
  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>COMUNICAÇÃO</Typography>
          <Typography variant="h4" fontWeight={800}>Materiais e avisos</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {canPublish ? 'Compartilhe conteúdos e comunicados com as turmas.' : 'Consulte os materiais e comunicados recebidos das suas turmas.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {canPublish && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="contained" onClick={() => setMaterialDialogOpen(true)} disabled={loading || classes.length === 0}>
              Publicar material
            </Button>
            <Button variant="outlined" onClick={() => setNotificationDialogOpen(true)} disabled={loading || classes.length === 0}>
              Enviar aviso
            </Button>
            {classes.length === 0 && !loading && <Alert severity="info">Cadastre uma turma para publicar conteúdo.</Alert>}
          </Stack>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={750}>Materiais da turma</Typography>
            <FormControl size="small" sx={{ minWidth: 220 }} disabled={loading || classes.length === 0}>
              <InputLabel id="materials-filter-label">Filtrar por turma</InputLabel>
              <Select
                labelId="materials-filter-label"
                label="Filtrar por turma"
                value={filterClassId}
                onChange={(event) => void applyClassFilter(event.target.value)}
              >
                <MenuItem value="">Todas as turmas</MenuItem>
                {classes.map((sportsClass) => (
                  <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Dialog open={materialDialogOpen} onClose={() => !savingMaterial && setMaterialDialogOpen(false)} fullWidth maxWidth="sm">
            <Box component="form" onSubmit={publishMaterial}>
              <DialogTitle>Publicar material</DialogTitle>
              <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
                <FormControl size="small" required>
                  <InputLabel id="material-class-label">Turma</InputLabel>
                  <Select
                    labelId="material-class-label"
                    label="Turma"
                    value={materialClassId}
                    onChange={(event) => setMaterialClassId(event.target.value)}
                    disabled={loading}
                  >
                    {classes.map((sportsClass) => (
                      <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Título" value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} inputProps={{ maxLength: 160 }} required />
                <TextField
                  label="Texto (opcional se informar link ou arquivo)"
                  value={materialBody}
                  onChange={(event) => setMaterialBody(event.target.value)}
                  multiline
                  minRows={3}
                  inputProps={{ maxLength: 5000 }}
                  required={!materialUrl.trim() && !materialFile}
                />
                <TextField
                  label="Link (opcional se informar texto ou arquivo)"
                  type="url"
                  value={materialUrl}
                  onChange={(event) => setMaterialUrl(event.target.value)}
                  error={Boolean(materialUrl && !validHttpUrl(materialUrl))}
                  helperText={materialUrl && !validHttpUrl(materialUrl) ? 'Informe um endereço HTTP ou HTTPS válido.' : undefined}
                  required={!materialBody.trim() && !materialFile}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                  <Button component="label" variant="outlined">
                    Selecionar arquivo (PDF, JPG ou PNG)
                    <input
                      hidden
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file && file.size > 10 * 1024 * 1024) {
                          setError('O arquivo deve ter no máximo 10 MB.');
                          event.target.value = '';
                          return;
                        }
                        setError('');
                        setMaterialFile(file);
                      }}
                    />
                  </Button>
                  {materialFile && (
                    <>
                      <Typography variant="body2" color="text.secondary">{materialFile.name}</Typography>
                      <Button size="small" onClick={() => setMaterialFile(null)}>Remover</Button>
                    </>
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">Tamanho máximo: 10 MB. O arquivo fica privado no R2 e só é acessível aos membros da turma.</Typography>
                {error && <Alert severity="error">{error}</Alert>}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={() => setMaterialDialogOpen(false)} disabled={savingMaterial}>Cancelar</Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={savingMaterial || loading || !materialClassId ||
                    (!materialBody.trim() && !validHttpUrl(materialUrl) && !materialFile)}
                >
                  {savingMaterial ? 'Publicando...' : 'Publicar material'}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>

          <Dialog open={notificationDialogOpen} onClose={() => !savingNotification && setNotificationDialogOpen(false)} fullWidth maxWidth="sm">
            <Box component="form" onSubmit={publishNotification}>
              <DialogTitle>Enviar aviso</DialogTitle>
              <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
                <FormControl size="small" required>
                  <InputLabel id="notification-class-label">Turma</InputLabel>
                  <Select
                    labelId="notification-class-label"
                    label="Turma"
                    value={notificationClassId}
                    onChange={(event) => setNotificationClassId(event.target.value)}
                    disabled={loading}
                  >
                    {classes.map((sportsClass) => (
                      <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality} ({sportsClass.studentIds.length} alunos)</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Título do aviso" value={notificationTitle} onChange={(event) => setNotificationTitle(event.target.value)} inputProps={{ maxLength: 120 }} required />
                <TextField label="Mensagem" value={notificationMessage} onChange={(event) => setNotificationMessage(event.target.value)} multiline minRows={4} inputProps={{ maxLength: 2000 }} required />
                {error && <Alert severity="error">{error}</Alert>}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={() => setNotificationDialogOpen(false)} disabled={savingNotification}>Cancelar</Button>
                <Button type="submit" variant="contained" disabled={savingNotification || loading || !notificationClassId}>
                  {savingNotification ? 'Enviando...' : 'Enviar aviso'}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
          {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box> : materials.length === 0 ? (
            <Typography color="text.secondary">Nenhum material publicado para esta turma.</Typography>
          ) : (
            <Grid container spacing={2}>
              {materials.map((material) => (
                <Grid item xs={12} md={6} key={material._id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="h6" fontWeight={750}>{material.title}</Typography>
                        <Chip size="small" label={className(material.classId)} />
                      </Stack>
                      {material.body && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{material.body}</Typography>}
                      {material.fileKey && <Typography color="text.secondary" variant="body2">{material.fileName ?? 'Este material contém um arquivo.'}</Typography>}
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>Publicado em {formatDate(material.createdAt)}</Typography>
                    </CardContent>
                    {material.url && validHttpUrl(material.url) && (
                      <CardActions sx={{ px: 2, pb: 2 }}>
                        <Button component="a" href={material.url} target="_blank" rel="noopener noreferrer">Abrir link</Button>
                      </CardActions>
                    )}
                    {material.fileKey && (
                      <CardActions sx={{ px: 2, pb: 2 }}>
                        <Button
                          onClick={() => void downloadMaterial(material)}
                          disabled={downloadingMaterialId === material._id}
                        >
                          {downloadingMaterialId === material._id ? 'Preparando arquivo...' : 'Baixar arquivo'}
                        </Button>
                      </CardActions>
                    )}
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={750}>Avisos recebidos</Typography>
            {notifications.some((notification) => !notification.readAt) && (
              <Chip size="small" color="primary" label={`${notifications.filter((notification) => !notification.readAt).length} não lidos`} />
            )}
          </Stack>
          {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box> : notifications.length === 0 ? (
            <Typography color="text.secondary">Você ainda não recebeu avisos.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {notifications.map((notification) => (
                <Paper key={notification._id} variant="outlined" sx={{ p: 2, borderColor: notification.readAt ? undefined : 'primary.light', bgcolor: notification.readAt ? undefined : 'primary.50' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} gap={1}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={750}>{notification.title}</Typography>
                        {notification.readAt ? <Chip size="small" label="Lido" /> : <Chip size="small" color="primary" label="Novo" />}
                        {notification.classId && <Chip size="small" variant="outlined" label={className(notification.classId)} />}
                      </Stack>
                      <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{notification.message}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>{formatDate(notification.createdAt)}</Typography>
                    </Box>
                    {!notification.readAt && (
                      <Button size="small" disabled={markingReadId === notification._id} onClick={() => void markAsRead(notification)}>
                        {markingReadId === notification._id ? 'Salvando...' : 'Marcar como lido'}
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </DashboardLayout>
  );
}
