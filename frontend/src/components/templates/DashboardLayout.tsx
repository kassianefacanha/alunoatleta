import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Container, Drawer, IconButton, List,
  ListItemButton, ListItemText, Menu, MenuItem, Tooltip, Typography
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { Brand } from '../atoms/Brand';
import { hasPermission, type TeacherPermission } from '../../lib/permissions';
import { logoutSession } from '../../lib/api';

interface NavigationItem {
  label: string;
  path: string;
  roles: string[];
  permission?: TeacherPermission;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    label: 'Gestão',
    items: [
      { label: 'Alunos e inscrições', path: '/alunos', roles: ['admin', 'teacher'], permission: 'students:read' },
      { label: 'Turmas e professores', path: '/turmas', roles: ['admin', 'teacher'] },
      { label: 'Chamada', path: '/chamadas', roles: ['admin', 'teacher'], permission: 'attendance:write' }
    ]
  },
  {
    label: 'Atividades',
    items: [
      { label: 'Tarefas e entregas', path: '/tarefas', roles: ['admin', 'teacher', 'student'], permission: 'assignments:read' },
      { label: 'Materiais e avisos', path: '/materiais-avisos', roles: ['admin', 'teacher', 'student'] },
      { label: 'Eventos e avaliações', path: '/eventos-avaliacoes', roles: ['admin', 'teacher', 'student'] },
      { label: 'Rede social', path: '/rede-social', roles: ['admin', 'teacher', 'student'], permission: 'social:read' }
    ]
  },
  {
    label: 'Relatórios',
    items: [
      { label: 'Exportações', path: '/exportacoes', roles: ['admin', 'teacher'], permission: 'exports:read' },
      { label: 'Auditoria', path: '/auditoria', roles: ['admin'] }
    ]
  }
];

const pageTitles: Record<string, string> = {
  '/alunos': 'Alunos e inscrições',
  '/turmas': 'Turmas e professores',
  '/chamadas': 'Chamada e presenças',
  '/tarefas': 'Tarefas e entregas',
  '/materiais-avisos': 'Materiais e avisos',
  '/eventos-avaliacoes': 'Eventos, aulas e avaliações',
  '/rede-social': 'Rede social da turma',
  '/meu-perfil': 'Meu perfil e desenvolvimento',
  '/auditoria': 'Logs de auditoria',
  '/exportacoes': 'Exportar dados',
  '/corrigir-inscricao': 'Corrigir inscrição',
  '/status': 'Situação da inscrição'
};

export function DashboardLayout({ children, onLogout, name, pageTitle }: { children: React.ReactNode; onLogout: () => void; name: string; pageTitle?: string }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}') as { role?: string };
  const enrollment = JSON.parse(sessionStorage.getItem('enrollment') ?? '{}') as { status?: string };
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.roles.includes(user.role ?? '') && (!item.permission || hasPermission(item.permission))
      )
    }))
    .filter((group) => group.items.length > 0);
  const showNavigation = user.role !== 'student' || enrollment.status === 'approved';
  const showStudentProfile = user.role === 'student' && enrollment.status === 'approved';
  const resolvedPageTitle = pageTitle ?? (location.pathname === '/app'
    ? user.role === 'admin' ? 'Visão geral do sistema' : user.role === 'teacher' ? 'Sua turma em foco' : 'Sua jornada esportiva'
    : pageTitles[location.pathname] ?? '');
  const isSelected = (path: string) => location.pathname === path;
  const isGroupSelected = (group: NavigationGroup) => group.items.some((item) => isSelected(item.path));

  useEffect(() => {
    setMenuOpen(false);
    setActiveGroup(null);
    setMenuAnchor(null);
    setMobileGroupOpen(groups.find(isGroupSelected)?.label ?? null);
  }, [location.pathname]);

  const closeMenu = () => {
    setActiveGroup(null);
    setMenuAnchor(null);
  };

  async function handleLogout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    let revocationFailed = false;
    try {
      await logoutSession();
    } catch {
      revocationFailed = true;
    } finally {
      onLogout();
    }
    if (revocationFailed) {
      sessionStorage.setItem('logoutNotice', 'A sessão foi encerrada neste dispositivo, mas não foi possível confirmar a revogação no servidor.');
    }
  }

  return (
    <Box className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <Box component="header" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Box className="site-header" sx={{ borderBottom: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {showNavigation && (
              <Tooltip title="Abrir menu">
                <IconButton
                  aria-label="Abrir menu de navegação"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                  sx={{ display: { xs: 'inline-flex', md: 'none' } }}
                >
                  <MenuRoundedIcon />
                </IconButton>
              </Tooltip>
            )}
            <Brand compact />
          </Box>
          {resolvedPageTitle && (
            <Typography
              component="h1"
              variant="h6"
              fontWeight={800}
              noWrap
              sx={{ flex: 1, minWidth: 0, mx: { xs: 1, sm: 2 }, fontSize: { xs: '0.95rem', sm: '1.25rem' } }}
            >
              {resolvedPageTitle}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 }, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 240 }}>{name}</Typography>
            <Tooltip title="Sair da conta">
              <Button size="small" startIcon={<LogoutRoundedIcon />} onClick={() => void handleLogout()} disabled={logoutLoading} aria-label="Sair da conta">
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sair</Box>
              </Button>
            </Tooltip>
          </Box>
        </Box>
        {showNavigation && (
          <Box
            component="nav"
            aria-label="Navegação principal"
            sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, maxWidth: 1200, mx: 'auto', px: 3, pb: 1 }}
          >
            <Button component={RouterLink} to="/app" aria-current={isSelected('/app') ? 'page' : undefined}>
              Painel
            </Button>
            {showStudentProfile && (
              <Button component={RouterLink} to="/meu-perfil" aria-current={isSelected('/meu-perfil') ? 'page' : undefined}>
                Meu perfil
              </Button>
            )}
            {groups.map((group) => {
              const open = activeGroup === group.label;
              return (
                <Box key={group.label}>
                  <Button
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={(event) => {
                      setMenuAnchor(event.currentTarget);
                      setActiveGroup(open ? null : group.label);
                    }}
                    endIcon={<ExpandMoreRoundedIcon />}
                    sx={{
                      bgcolor: isGroupSelected(group) ? 'primary.light' : undefined,
                      color: isGroupSelected(group) ? 'primary.dark' : undefined
                    }}
                  >
                    {group.label}
                  </Button>
                  <Menu
                    anchorEl={activeGroup === group.label ? menuAnchor : null}
                    open={open}
                    onClose={closeMenu}
                  >
                    {group.items.map((item) => (
                      <MenuItem
                        key={item.path}
                        component={RouterLink}
                        to={item.path}
                        selected={isSelected(item.path)}
                        aria-current={isSelected(item.path) ? 'page' : undefined}
                        onClick={closeMenu}
                      >
                        {item.label}
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      <Drawer anchor="left" open={menuOpen} onClose={() => setMenuOpen(false)} sx={{ display: { md: 'none' } }}>
        <Box sx={{ width: 'min(84vw, 320px)', pt: 2 }} role="presentation">
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            <Typography variant="overline" color="text.secondary">MENU</Typography>
            <Typography variant="body2" fontWeight={700} noWrap>{name}</Typography>
          </Box>
          <List aria-label="Navegação principal">
            <ListItemButton component={RouterLink} to="/app" selected={isSelected('/app')} sx={{ mx: 1, borderRadius: 2 }}>
              <ListItemText primary="Painel" />
            </ListItemButton>
            {showStudentProfile && (
              <ListItemButton component={RouterLink} to="/meu-perfil" selected={isSelected('/meu-perfil')} sx={{ mx: 1, borderRadius: 2 }}>
                <ListItemText primary="Meu perfil" />
              </ListItemButton>
            )}
            {groups.map((group) => (
              <Accordion
                key={group.label}
                disableGutters
                elevation={0}
                expanded={mobileGroupOpen === group.label}
                onChange={(_event, expanded) => setMobileGroupOpen(expanded ? group.label : null)}
                sx={{ '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 44, px: 2.5, '& .MuiAccordionSummary-content': { my: 1 } }}>
                  <Typography variant="overline" color="text.secondary">{group.label}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0, pb: 1 }}>
                  {group.items.map((item) => (
                    <ListItemButton
                      key={item.path}
                      component={RouterLink}
                      to={item.path}
                      selected={isSelected(item.path)}
                      aria-current={isSelected(item.path) ? 'page' : undefined}
                      sx={{ mx: 1, borderRadius: 2 }}
                    >
                      <ListItemText primary={item.label} />
                    </ListItemButton>
                  ))}
                </AccordionDetails>
              </Accordion>
            ))}
          </List>
        </Box>
      </Drawer>
      <Container component="main" id="main-content" tabIndex={-1} maxWidth="lg" sx={{ py: { xs: 2.5, md: 3.5 }, flex: 1 }}>{children}</Container>
      <Box component="footer" className="site-footer">Projeto Aluno/Atleta · Alto da Mangueira · Maracanaú/CE</Box>
    </Box>
  );
}
