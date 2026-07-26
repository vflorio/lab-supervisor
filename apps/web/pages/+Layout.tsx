import { BugReport, ChevronLeft, ChevronRight, FiberManualRecord, Home, Settings } from "@mui/icons-material";
import {
  Box,
  CssBaseline,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  ThemeProvider,
  Tooltip,
  Typography,
} from "@mui/material";
import { SnackbarProvider } from "notistack";
import { useState } from "react";
import { match } from "ts-pattern";
import { usePageContext } from "vike-react/usePageContext";
import { LogPanel } from "../components/LogPanel";
import { LogFeedProvider, useLogFeed } from "../hooks/useLogFeed";
import { NotifyToaster } from "../hooks/useNotify";
import { PredicatesProvider } from "../hooks/usePredicates";
import "./Layout.css";
import { closeSnackbar } from "notistack";
import { theme } from "../theme";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: <Home fontSize="small" /> },
  { href: "/mock", label: "Mock data", icon: <BugReport fontSize="small" /> },
  { href: "/settings", label: "Settings", icon: <Settings fontSize="small" /> },
];

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        autoHideDuration={10 * 60 * 1000}
        action={(key) => (
          <IconButton size="small" color="inherit" onClick={() => closeSnackbar(key)}>
            <ChevronLeft fontSize="small" />
          </IconButton>
        )}
      >
        <LogFeedProvider>
          <PredicatesProvider>
            <NotifyToaster />
            <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
              <Sidebar />
              <Box id="page-content" component="main" sx={{ flexGrow: 2, minWidth: 0, p: { xs: 2, md: 4 } }}>
                {children}
              </Box>
              <LogPanel />
            </Box>
          </PredicatesProvider>
        </LogFeedProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}

function Sidebar() {
  const pageContext = usePageContext();
  const { urlPathname } = pageContext;
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 2,
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        transition: (theme) => theme.transitions.create("width"),
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          px: 1,
          py: 2,
        }}
      >
        {!collapsed && (
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
            Lab Supervisor
          </Typography>
        )}
        <IconButton
          size="small"
          onClick={() => setCollapsed((prev) => !prev)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
        </IconButton>
      </Box>
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? urlPathname === item.href : urlPathname.startsWith(item.href);
          return (
            <Tooltip key={item.href} title={item.label} placement="right" disableHoverListener={!collapsed}>
              <ListItemButton
                component="a"
                href={item.href}
                selected={isActive}
                sx={{
                  justifyContent: collapsed ? "center" : "flex-start",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": { bgcolor: "primary.main" },
                    "& .MuiListItemIcon-root": { color: "inherit" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: "center" }}>{item.icon}</ListItemIcon>
                {!collapsed && <ListItemText primary={item.label} />}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
      <Box sx={{ mt: "auto" }}>
        <ServiceStatusIndicator collapsed={collapsed} />
      </Box>
    </Box>
  );
}

function ServiceStatusIndicator({ collapsed }: { collapsed: boolean }) {
  const { status } = useLogFeed();

  const { color, label } = match(status)
    .with("online", () => ({ color: "success.main" as const, label: "Service online" }))
    .with("reconnecting", () => ({ color: "error.main" as const, label: "Service unreachable" }))
    .with("connecting", () => ({ color: "warning.main" as const, label: "Connecting…" }))
    .exhaustive();

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ px: 1, alignItems: "center", justifyContent: collapsed ? "center" : "flex-start" }}
    >
      <FiberManualRecord sx={{ fontSize: 10, color, flexShrink: 0 }} />
      {!collapsed && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {label}
        </Typography>
      )}
    </Stack>
  );
}
