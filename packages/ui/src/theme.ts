import { createTheme } from "@mui/material/styles";
import type { CSSProperties } from "react";

export const monoFontFamily = "'JetBrains Mono', monospace" as const;

declare module "@mui/material/styles" {
  interface TypographyVariants {
    monoEyebrow: CSSProperties;
    monoLabel: CSSProperties;
    monoTitle: CSSProperties;
    monoCode: CSSProperties;
    emphasizedValue: CSSProperties;
  }
  interface TypographyVariantsOptions {
    monoEyebrow?: CSSProperties;
    monoLabel?: CSSProperties;
    monoTitle?: CSSProperties;
    monoCode?: CSSProperties;
    emphasizedValue?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    monoEyebrow: true;
    monoLabel: true;
    monoTitle: true;
    monoCode: true;
    emphasizedValue: true;
  }
}

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0d0f11", paper: "#141719" },
    primary: { main: "#4ade80", contrastText: "#0a0c0e" },
    secondary: { main: "#1c1f22" },
    warning: { main: "#f59e0b" },
    info: { main: "#3b82f6" },
    error: { main: "#ef4444" },
    text: { primary: "#e2e4e8", secondary: "#6b7280" },
    divider: "rgba(255,255,255,0.07)",
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    button: { textTransform: "none", fontFamily: monoFontFamily },
    monoEyebrow: {
      fontFamily: monoFontFamily,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    monoLabel: {
      fontFamily: monoFontFamily,
      fontSize: 10,
    },
    monoTitle: {
      fontFamily: monoFontFamily,
      fontSize: 12,
    },
    monoCode: {
      fontFamily: monoFontFamily,
      fontSize: 11,
      lineHeight: 1.7,
    },
    emphasizedValue: {
      fontSize: 13,
      lineHeight: 1.4,
      fontWeight: 700,
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: "1px solid rgba(255,255,255,0.07)" },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "transparent",
          border: "1px solid rgba(255,255,255,0.07)",
          "&:before": { display: "none" },
          "&.Mui-expanded": { margin: 0 },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: { minHeight: 40, "&.Mui-expanded": { minHeight: 40 } },
        content: { margin: "8px 0", "&.Mui-expanded": { margin: "8px 0" } },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.07)",
          color: "#6b7280",
          fontFamily: monoFontFamily,
          fontSize: 11,
          padding: "3px 10px",
          "&.Mui-selected": {
            color: "#4ade80",
            backgroundColor: "rgba(74,222,128,0.15)",
            borderColor: "rgba(74,222,128,0.3)",
          },
          "&.Mui-selected:hover": { backgroundColor: "rgba(74,222,128,0.2)" },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: monoFontFamily, fontSize: 10, height: 20, borderRadius: 4 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontFamily: monoFontFamily,
          fontSize: 12,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.07)" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.15)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(74,222,128,0.5)" },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontFamily: monoFontFamily, fontSize: 12 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        listbox: { fontFamily: monoFontFamily, fontSize: 12, padding: 4 },
        option: { borderRadius: 4 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontFamily: monoFontFamily, fontSize: 11 },
        sizeSmall: { padding: "3px 10px" },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontFamily: monoFontFamily, fontSize: 12 },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: { fontFamily: monoFontFamily, fontSize: 11 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: "#141719", backgroundImage: "none", borderLeft: "1px solid rgba(255,255,255,0.07)" },
      },
    },
  },
});
