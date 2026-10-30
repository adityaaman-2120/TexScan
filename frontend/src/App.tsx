import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { DEFAULT_PATH, NAV_ITEMS, requireNav } from "@/app/nav";
import { PageTransition } from "@/components/motion";
import { ArenaPage } from "@/features/arena/ArenaPage";
import { BatchPage } from "@/features/batch/BatchPage";
import { AboutPage } from "@/features/about/AboutPage";
import { LivePage } from "@/features/live/LivePage";
import { InspectPage } from "@/features/inspect/InspectPage";
import { RobustnessPage } from "@/features/robustness/RobustnessPage";
import { SpectrumPage } from "@/features/spectrum/SpectrumPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { ProfilesPage } from "@/features/profiles/ProfilesPage";

/** Pages with real content; everything else in NAV_ITEMS renders the shared placeholder. */
const PAGES: Record<string, React.ReactNode> = {
  "/inspect": <InspectPage />,
  "/batch": <BatchPage />,
  "/live": <LivePage />,
  "/arena": <ArenaPage />,
  "/robustness": <RobustnessPage />,
  "/spectrum": <SpectrumPage />,
  "/history": <HistoryPage />,
  "/profiles": <ProfilesPage />,
  "/dashboard": <DashboardPage />,
  "/about": <AboutPage />,
};

export default function App() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <AppShell>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to={DEFAULT_PATH} replace />} />
          {NAV_ITEMS.map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={<PageTransition>{PAGES[item.path] ?? <PlaceholderPage item={requireNav(item.path)} />}</PageTransition>}
            />
          ))}
          <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </AppShell>
  );
}
