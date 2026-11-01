import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { LandingPage } from "./features/landing/LandingPage";
import "./index.css";
import { APP_BASE, entryFor } from "./lib/entry";
import { queryClient } from "./lib/query";

const { pathname, search, hash } = window.location;
const entry = entryFor(pathname, search, hash);

if (entry.kind === "legacy") {
  // an old link such as /inspect: the app now lives under /app
  window.location.replace(entry.to);
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        {entry.kind === "landing" ? (
          <LandingPage />
        ) : (
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={APP_BASE}>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        )}
      </MotionConfig>
    </StrictMode>,
  );
}
