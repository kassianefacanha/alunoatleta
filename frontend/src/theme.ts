import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1263a8', dark: '#123d68', light: '#e8f2fb' },
    secondary: { main: '#e89a22', dark: '#bd6816', light: '#fff3df' },
    background: { default: '#f4f7fa', paper: '#ffffff' },
    text: { primary: '#1c2b3a', secondary: '#657384' },
    success: { main: '#24734b' }
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", Arial, sans-serif',
    h1: { fontWeight: 750, letterSpacing: '-0.04em' },
    h2: { fontWeight: 700, letterSpacing: '-0.03em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    button: { textTransform: 'none', fontWeight: 650 }
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 10, paddingInline: 18 } } },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 18 } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'small' } },
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f4f7fa' },
        '::selection': { backgroundColor: '#c9def1', color: '#123d68' }
      }
    }
  }
});
