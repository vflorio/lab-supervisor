import { CssBaseline, createTheme, ThemeProvider } from "@mui/material";
import * as Schedule from "@supervisor/core/schedule";
import * as UISchedule from "@supervisor/ui/schedule";
import { createRoot } from "react-dom/client";
import "./retry";

function App() {
  return (
    <ThemeProvider theme={createTheme({ palette: { mode: "light" } })}>
      <CssBaseline />

      <UISchedule.Builder
        presets={[
          {
            name: "Eccezione giornaliera",
            description: "Tutti i giorni 9-18, escludi Lunedì, aggiungi Lun 18-19",
            steps: [
              { label: "Tutti i giorni 9:00-18:00", schedule: Schedule.timeRange([9, 0], [18, 0]), op: "union" },
              { label: "Lunedì", schedule: Schedule.day(0), op: "subtract" },
              { label: "Lun 18:00-19:00", schedule: Schedule.block(0, [18, 0], [19, 0]), op: "union" },
            ],
          },
          {
            name: "Digital signage negozio",
            description: "Promo feriali 9-20, weekend 10-18, blackout pausa pranzo",
            steps: [
              { label: "Feriali 9:00-20:00", schedule: Schedule.weekdays([9, 0], [20, 0]), op: "union" },
              { label: "Weekend 10:00-18:00", schedule: Schedule.weekend([10, 0], [18, 0]), op: "union" },
              { label: "Pausa pranzo 13:00-14:00", schedule: Schedule.timeRange([13, 0], [14, 0]), op: "subtract" },
            ],
          },
          {
            name: "Palinsesto TV",
            description: "TG mattina e sera + spot ricorrenti in fascia diurna",
            steps: [
              { label: "TG Mattina 7:00-7:30", schedule: Schedule.duration([7, 0], 30), op: "union" },
              { label: "TG Sera 20:00-20:30", schedule: Schedule.duration([20, 0], 30), op: "union" },
              { label: "Spot 2min ogni 20min", schedule: Schedule.recurring(20, 2), op: "union" },
              { label: "Solo fascia 6:00-23:00", schedule: Schedule.timeRange([6, 0], [23, 0]), op: "intersection" },
            ],
          },
          {
            name: "Supporto clienti",
            description: "Lun-Ven 8-18, Sab mattina, mai Domenica",
            steps: [
              { label: "Feriali 8:00-18:00", schedule: Schedule.weekdays([8, 0], [18, 0]), op: "union" },
              { label: "Sab 9:00-13:00", schedule: Schedule.block(5, [9, 0], [13, 0]), op: "union" },
            ],
          },
          {
            name: "Manutenzione notturna",
            description: "Sempre attivo h24, escludi finestra manutenzione 2-5 AM",
            steps: [
              { label: "Sempre attivo", schedule: Schedule.always, op: "union" },
              { label: "Manutenzione 2:00-5:00", schedule: Schedule.timeRange([2, 0], [5, 0]), op: "subtract" },
              { label: "Niente weekend", schedule: Schedule.weekend([0, 0], [23, 59]), op: "subtract" },
            ],
          },
          {
            name: "Ristorante",
            description: "Pranzo e cena, chiuso Martedì, brunch domenicale",
            steps: [
              { label: "Pranzo 12:00-14:30", schedule: Schedule.timeRange([12, 0], [14, 30]), op: "union" },
              { label: "Cena 19:00-23:00", schedule: Schedule.timeRange([19, 0], [23, 0]), op: "union" },
              { label: "Chiuso Martedì", schedule: Schedule.day(1), op: "subtract" },
              { label: "Brunch Dom 10:00-14:00", schedule: Schedule.block(6, [10, 0], [14, 0]), op: "union" },
            ],
          },
        ]}
      />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
