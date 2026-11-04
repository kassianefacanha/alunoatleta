import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography
} from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';
import { hasPermission } from '../lib/permissions';

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
}

interface SocialAuthor {
  _id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
}

interface SocialComment {
  _id: string;
  text: string;
  createdAt: string;
  authorId: SocialAuthor | string;
}

interface SocialPost {
  _id: string;
  classId: string;
  text: string;
  link?: string;
  createdAt: string;
  authorId: SocialAuthor | string;
  likedBy: string[];
  comments: SocialComment[];
}

const roleLabels = { admin: 'Administração', teacher: 'Professor', student: 'Aluno' };

function authorDetails(author: SocialAuthor | string) {
  return typeof author === 'string'
    ? { name: 'Membro da turma', role: undefined as string | undefined }
    : { name: author.email, role: roleLabels[author.role] };
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

export function SocialPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"id":"","email":"Usuário","role":"student"}') as { id: string; email: string; role: string };
  const canInteract = user.role !== 'teacher' || hasPermission('social:write');
  const canPost = canInteract;
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [classId, setClassId] = useState('');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postText, setPostText] = useState('');
  const [postLink, setPostLink] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [classesLoading, setClassesLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<{ classes: SportsClass[] }>('/classes')
      .then(({ classes: result }) => {
        if (!active) return;
        setClasses(result);
        if (result.length) setClassId(result[0]._id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as turmas.');
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!classId) {
      setPosts([]);
      return;
    }
    let active = true;
    setFeedLoading(true);
    setError('');
    apiRequest<{ posts: SocialPost[] }>(`/social/posts?classId=${encodeURIComponent(classId)}`)
      .then(({ posts: result }) => {
        if (active) setPosts(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setPosts([]);
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as publicações.');
        }
      })
      .finally(() => {
        if (active) setFeedLoading(false);
      });
    return () => { active = false; };
  }, [classId]);

  async function reloadFeed() {
    if (!classId) return;
    const result = await apiRequest<{ posts: SocialPost[] }>(`/social/posts?classId=${encodeURIComponent(classId)}`);
    setPosts(result.posts);
  }

  async function createPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return;
    if (postLink.trim() && !validHttpUrl(postLink.trim())) {
      setError('O link deve começar com http:// ou https://.');
      return;
    }
    setPosting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          classId,
          text: postText.trim(),
          ...(postLink.trim() ? { link: postLink.trim() } : {})
        })
      });
      setPostText('');
      setPostLink('');
      setComposerOpen(false);
      await reloadFeed();
      setNotice('Publicação enviada para a turma.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a publicação.');
    } finally {
      setPosting(false);
    }
  }

  async function addComment(postId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = commentDrafts[postId]?.trim();
    if (!text) return;
    setCommentingId(postId);
    setError('');
    try {
      await apiRequest(`/social/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      await reloadFeed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o comentário.');
    } finally {
      setCommentingId(null);
    }
  }

  async function toggleLike(post: SocialPost) {
    setLikingId(post._id);
    setError('');
    try {
      const result = await apiRequest<{ liked: boolean }>(`/social/posts/${post._id}/like`, { method: 'POST' });
      setPosts((current) => current.map((item) => {
        if (item._id !== post._id) return item;
        const likedBy = result.liked
          ? [...new Set([...item.likedBy, user.id])]
          : item.likedBy.filter((id) => id !== user.id);
        return { ...item, likedBy };
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a curtida.');
    } finally {
      setLikingId(null);
    }
  }

  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>COMUNIDADE</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {canInteract
              ? 'Compartilhe mensagens e links com os membros da sua turma. Publicações não aceitam fotos ou arquivos.'
              : 'Consulte as publicações da sua turma. Sua conta não tem permissão para interagir.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 320 } }} disabled={classesLoading || classes.length === 0}>
            <InputLabel id="social-class-label">Turma</InputLabel>
            <Select
              labelId="social-class-label"
              label="Turma"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              {classes.map((sportsClass) => (
                <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        {canPost && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => setComposerOpen(true)} disabled={classesLoading || classes.length === 0}>
              Nova publicação
            </Button>
            {classes.length === 0 && !classesLoading && <Alert severity="info">Você ainda não tem uma turma para participar da rede social.</Alert>}
          </Stack>
        )}

        <Box>
          <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Publicações recentes</Typography>
          {classesLoading || feedLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : classes.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Nenhuma turma disponível.</Typography>
            </Paper>
          ) : posts.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Ainda não há publicações nesta turma. Seja o primeiro a compartilhar uma mensagem!</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {posts.map((post) => {
                const author = authorDetails(post.authorId);
                const liked = post.likedBy.includes(user.id);
                return (
                  <Grid item xs={12} key={post._id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
                          <Box>
                            <Typography fontWeight={750}>{author.name}</Typography>
                            {author.role && <Chip size="small" label={author.role} sx={{ mt: 0.5 }} />}
                          </Box>
                          <Typography variant="caption" color="text.secondary">{formatDate(post.createdAt)}</Typography>
                        </Stack>
                        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.text}</Typography>
                        {post.link && validHttpUrl(post.link) && (
                          <Button component="a" href={post.link} target="_blank" rel="noopener noreferrer" sx={{ mt: 1, px: 0 }}>
                            Abrir link compartilhado
                          </Button>
                        )}
                      </CardContent>
                      <CardActions sx={{ px: 2, pb: 1 }}>
                        {canInteract && <Button size="small" disabled={likingId === post._id} onClick={() => void toggleLike(post)}>
                          {liked ? 'Descurtir' : 'Curtir'} · {post.likedBy.length}
                        </Button>}
                        <Typography variant="body2" color="text.secondary">{post.comments.length} comentários</Typography>
                      </CardActions>
                      <CardContent sx={{ pt: 0 }}>
                        {post.comments.length > 0 && (
                          <Stack spacing={1.5} sx={{ mb: 2 }}>
                            {post.comments.map((comment) => {
                              const commentAuthor = authorDetails(comment.authorId);
                              return (
                                <Paper key={comment._id} variant="outlined" sx={{ p: 1.5 }}>
                                  <Stack direction="row" justifyContent="space-between" gap={1}>
                                    <Typography variant="body2" fontWeight={700}>{commentAuthor.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{formatDate(comment.createdAt)}</Typography>
                                  </Stack>
                                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.text}</Typography>
                                </Paper>
                              );
                            })}
                          </Stack>
                        )}
                        {canInteract && <Box component="form" onSubmit={(event) => void addComment(post._id, event)} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                          <TextField
                            size="small"
                            label="Escreva um comentário"
                            value={commentDrafts[post._id] ?? ''}
                            onChange={(event) => setCommentDrafts((current) => ({ ...current, [post._id]: event.target.value }))}
                            inputProps={{ maxLength: 1000 }}
                            fullWidth
                            required
                          />
                          <Button type="submit" variant="outlined" disabled={commentingId === post._id || !(commentDrafts[post._id] ?? '').trim()}>
                            {commentingId === post._id ? 'Enviando...' : 'Comentar'}
                          </Button>
                        </Box>}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      </Stack>
      <Dialog open={composerOpen} onClose={() => !posting && setComposerOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={createPost}>
          <DialogTitle>Nova publicação</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <Typography variant="body2" color="text.secondary">
              Compartilhe mensagens e links com a turma. Não é permitido publicar fotos ou arquivos.
            </Typography>
            <TextField
              label="Mensagem"
              placeholder="Compartilhe uma notícia, conquista ou mensagem com sua turma..."
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
              helperText={`${postText.length}/2000 caracteres`}
              required
            />
            <TextField
              label="Link (opcional)"
              type="url"
              value={postLink}
              onChange={(event) => setPostLink(event.target.value)}
              error={Boolean(postLink && !validHttpUrl(postLink))}
              helperText={postLink && !validHttpUrl(postLink) ? 'Informe um link HTTP ou HTTPS válido.' : undefined}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setComposerOpen(false)} disabled={posting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={posting || feedLoading || !classId || !postText.trim() || Boolean(postLink && !validHttpUrl(postLink))}>
              {posting ? 'Publicando...' : 'Publicar'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </DashboardLayout>
  );
}
