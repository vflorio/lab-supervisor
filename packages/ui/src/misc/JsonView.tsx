import { Box, Stack, Typography } from "@mui/material";

export interface JsonViewProps {
  readonly data: unknown;
}

export function JsonView({ data }: JsonViewProps) {
  return (
    <Box sx={{ bgcolor: "#0a0c0e", border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          gap: 1,
          alignItems: "center",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "#0d0f11",
        }}
      >
        <Typography variant="monoLabel" sx={{ color: "textSecondary", ml: 1 }}>
          JSON
        </Typography>
      </Stack>
      <Box
        component="pre"
        sx={(theme) => ({
          ...theme.typography.monoCode,
          color: "primary.main",
          p: 2,
          m: 0,
          overflowX: "auto",
        })}
      >
        {JSON.stringify(data, null, 2)}
      </Box>
    </Box>
  );
}
