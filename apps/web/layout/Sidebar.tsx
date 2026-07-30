import { BugReport, ChevronLeft, ChevronRight, FiberManualRecord, Home, Settings } from "@mui/icons-material";
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useLayoutEffect, useState } from "react";
import { match } from "ts-pattern";
import { useLogFeed } from "../hooks/useLogFeed";
import { PANEL_HEADER_HEIGHT, panelHeaderIconSx } from "./PanelHeader";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: <Home fontSize="small" /> },
  { href: "/mock", label: "Mock data", icon: <BugReport fontSize="small" /> },
  { href: "/settings", label: "Settings", icon: <Settings fontSize="small" /> },
];

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = PANEL_HEADER_HEIGHT;
const COLLAPSED_STORAGE_KEY = "sidebar:collapsed";

export function Sidebar({ urlPathname }: { urlPathname: string }) {
  const [collapsed, setCollapsedState] = useState(true);

  // Idrata lo stato persistito solo dopo il mount (mai durante l'SSR): il primo render deve
  // combaciare esattamente con l'HTML del server (default true), altrimenti React segnala un
  // hydration mismatch - stesso pattern di ResizablePanel per la width del LogPanel.
  useLayoutEffect(() => {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (raw !== null) setCollapsedState(raw === "true");
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  };

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        transition: (theme) => theme.transitions.create("width"),
      }}
    >
      <Box
        sx={{
          height: PANEL_HEADER_HEIGHT,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          p: 1,
        }}
      >
        {!collapsed && (
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, p: 1, pl: 2 }}>
            Lab Supervisor
          </Typography>
        )}
        <IconButton size="small" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
        </IconButton>
      </Box>
      <Divider />
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
                  gap: 1,
                  justifyContent: collapsed ? "center" : "flex-start",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": { bgcolor: "primary.main" },
                    "& .MuiListItemIcon-root": { color: "inherit" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: "center" }}>
                  <Box
                    sx={{
                      ...panelHeaderIconSx,
                      ...(isActive && { bgcolor: "rgba(0,0,0,0.8)" }),
                    }}
                  >
                    {item.icon}
                  </Box>
                </ListItemIcon>
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
        <Typography variant="caption" color="textSecondary" noWrap>
          {label}
        </Typography>
      )}
    </Stack>
  );
}
