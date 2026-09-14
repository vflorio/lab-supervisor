import { BugReport, ChevronLeft, ChevronRight, Home, Settings } from "@mui/icons-material";
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { booleanCodec, usePersistedState } from "@supervisor/ui/misc/usePersistedState";
import { PANEL_HEADER_HEIGHT, panelHeaderIconSx } from "./PanelHeader";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: <Home fontSize="small" /> },
  { href: "/settings", label: "Settings", icon: <Settings fontSize="small" /> },
  import.meta.env.DEV ? { href: "/mock", label: "Mock data", icon: <BugReport fontSize="small" /> } : null,
].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = PANEL_HEADER_HEIGHT;
const COLLAPSED_STORAGE_KEY = "sidebar:collapsed";

export function Sidebar({ urlPathname }: { urlPathname: string }) {
  const [collapsed, setCollapsed] = usePersistedState(COLLAPSED_STORAGE_KEY, true, booleanCodec);

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
          <Box sx={{ p: 1, pl: 2, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Lab Supervisor
            </Typography>
          </Box>
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
    </Box>
  );
}
