import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1565db", dark: "#1046a7", light: "#3d82ed" },
    secondary: { main: "#0d315b" },
    success: { main: "#1d976d" },
    background: { default: "#f8faff", paper: "#ffffff" },
    text: { primary: "#172a46", secondary: "#72809a" },
    divider: "#eaf0f8",
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", sans-serif',
    h1: { fontWeight: 800, letterSpacing: "-0.065em" },
    h2: { fontWeight: 800, letterSpacing: "-0.055em" },
    h3: { fontWeight: 800, letterSpacing: "-0.045em" },
    h4: { fontWeight: 750, letterSpacing: "-0.035em" },
    h5: { fontWeight: 750, letterSpacing: "-0.025em" },
    h6: { fontWeight: 700, letterSpacing: "-0.015em" },
    body2: { lineHeight: 1.75 },
    button: { fontWeight: 650, textTransform: "none", letterSpacing: "-0.01em" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 46, borderRadius: 12, paddingInline: 19 },
        containedPrimary: {
          boxShadow: "0 5px 15px rgba(21,101,219,.18)",
        },
      },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, size: "small" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 47,
          borderRadius: 11,
          backgroundColor: "#fff",
          "& fieldset": { borderColor: "#e3eaf3" },
          "&:hover fieldset": { borderColor: "#afbed1" },
        },
      },
    },
  },
});
