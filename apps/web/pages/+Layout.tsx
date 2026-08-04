import { ChevronLeft } from "@mui/icons-material";
import { Box, CssBaseline, IconButton, ThemeProvider } from "@mui/material";
import { theme } from "@supervisor/ui/theme";
import { closeSnackbar, SnackbarProvider } from "notistack";
import { LogPanel } from "../components/LogPanel";
import { ActivityProvider } from "../hooks/useActivity";
import { FactsProvider } from "../hooks/useFacts";
import { LogFeedProvider } from "../hooks/useLogFeed";
import { NotifyToaster } from "../hooks/useNotify";
import { RecoveryProvider } from "../hooks/useRecovery";
import { Sidebar } from "../layout/Sidebar";
import "./Layout.css";
import { usePageContext } from "vike-react/usePageContext";

export default function Layout({ children }: { children: React.ReactNode }) {
  const pageContext = usePageContext();
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
          <FactsProvider>
            <ActivityProvider>
              <RecoveryProvider>
                <NotifyToaster />
                <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
                  <Sidebar urlPathname={pageContext.urlPathname} />
                  <Box
                    id="page-content"
                    component="main"
                    sx={{
                      flexGrow: 2,
                      minWidth: 0,
                      minHeight: 0,
                      overflowY: "auto",
                    }}
                  >
                    {children}
                  </Box>
                  <LogPanel />
                </Box>
              </RecoveryProvider>
            </ActivityProvider>
          </FactsProvider>
        </LogFeedProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
