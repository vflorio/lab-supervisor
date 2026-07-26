import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface SectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, actions, children }: SectionProps) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        {actions}
      </Box>

      <Box sx={{ maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>{children}</Box>
    </Box>
  );
}
