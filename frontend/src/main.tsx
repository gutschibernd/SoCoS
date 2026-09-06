import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./stil/grund.css";
import { App } from "./App";

const abfragen = new QueryClient({
  defaultOptions: {
    queries: {
      // Wiederholt wird nur, was gar keine Antwort bekommen hat. Eine 404 wird
      // beim zweiten Fragen nicht zur 200, und eine 403 auch nicht.
      retry: (versuch, fehler) => {
        const status = (fehler as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return versuch < 2;
      },
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("wurzel")!).render(
  <StrictMode>
    <QueryClientProvider client={abfragen}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
