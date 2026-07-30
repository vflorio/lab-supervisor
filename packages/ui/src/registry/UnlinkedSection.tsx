import { LinkOff } from "@mui/icons-material";
import { Box } from "@mui/material";
import { type ReactNode, useState } from "react";
import { DomainCardAccordion } from "../misc/DomainCardAccordion";
import { entryRowGridSx } from "../misc/EntryRow";

export interface UnlinkedSectionProps {
  readonly count: number;
  readonly children?: ReactNode;
}

// Entità orfane (TV/camere non agganciate a nessuna control unit) - riusa DomainCardAccordion
// per il collapse (nessun `Accordion` MUI in questo repo, vedi il suo commento) ma stabilisce
// la propria griglia perché è una lista indipendente dalle card delle control unit. `LinkOff`
// non è nel vocabolario icone di §11: "unlinked" è un concetto nuovo che non ne aveva uno.
export function UnlinkedSection({ count, children }: UnlinkedSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (count === 0) return null;

  return (
    <DomainCardAccordion
      icon={<LinkOff fontSize="small" />}
      title={`Unlinked — ${count} ${count === 1 ? "device" : "devices"}`}
      expanded={expanded}
      onToggle={() => setExpanded((current) => !current)}
    >
      <Box sx={{ ...entryRowGridSx, rowGap: 1.5 }}>{children}</Box>
    </DomainCardAccordion>
  );
}
