import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1b1b1d",
      paper: "#242526",
    },
    primary: {
      main: "#25c2a0",
      light: "#4fddbf",
      dark: "#1a8870",
      contrastText: "#f8f8f2",
    },
    secondary: {
      main: "#29d5b0",
      light: "#99f6e4",
      dark: "#21af90",
      contrastText: "#1b1b1d",
    },
    error: {
      main: "#ff5555",
      contrastText: "#f8f8f2",
    },
    warning: {
      main: "#ffb86c",
      contrastText: "#1b1b1d",
    },
    info: {
      main: "#bd93f9",
      contrastText: "#f8f8f2",
    },
    success: {
      main: "#50fa7b",
      contrastText: "#1b1b1d",
    },
    text: {
      primary: "#f8f8f2",
      secondary: "#a6a6a6",
    },
    divider: "rgba(166, 166, 166, 0.16)",
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
    h5: {
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    overline: {
      fontWeight: 600,
      letterSpacing: "0.06em",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*::-webkit-scrollbar": {
          width: 8,
          height: 8,
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: "transparent",
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(166, 166, 166, 0.3)",
          borderRadius: 999,
        },
        "*::-webkit-scrollbar-thumb:hover": {
          backgroundColor: "#21af90",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(166, 166, 166, 0.16)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
      variants: [
        {
          props: { color: "primary" },
          style: {
            backgroundColor: "#1a8870",
            border: "1px solid #4fddbf",
            color: "#f8f8f2",
            "&:hover": { backgroundColor: "#21af90" },
          },
        },
      ],
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: "rgba(166, 166, 166, 0.4)",
          "&.Mui-checked": {
            color: "#4fddbf",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 999,
        },
        outlined: {
          borderColor: "rgba(166, 166, 166, 0.24)",
        },
      },
      variants: [
        {
          props: { variant: "filled", color: "default" },
          style: {
            backgroundColor: "#2d3748",
            border: "1px solid rgba(166, 166, 166, 0.24)",
          },
        },
        {
          props: { variant: "filled", color: "primary" },
          style: {
            backgroundColor: "#1a8870",
            border: "1px solid #4fddbf",
          },
        },
        {
          props: { variant: "filled", color: "secondary" },
          style: {
            backgroundColor: "#21af90",
            border: "1px solid #29d5b0",
          },
        },
      ],
    },
  },
});
