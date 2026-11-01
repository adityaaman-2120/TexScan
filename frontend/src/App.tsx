import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { DEFAULT_PATH, NAV_ITEMS } from "@/app/nav";
import { PageTransition } from "@/components/motion";
import { ArenaPage } from "@/features/arena/ArenaPage";
import { BatchPage } from "@/features/batch/BatchPage";
import { CalibrationPage } from "@/features/calibration/CalibrationPage";
import { BitPlanesPage } from "@/features/bitplanes/BitPlanesPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { InspectPage } from "@/features/inspect/InspectPage";
import { LivePage } from "@/features/live/LivePage";
import { ProfilesPage } from "@/features/profiles/ProfilesPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { RobustnessPage } from "@/features/robustness/RobustnessPage";
import { RollPage } from "@/features/rolls/RollPage";
import { RollsPage } from "@/features/rolls/RollsPage";
import { SpectrumPage } from "@/features/spectrum/SpectrumPage";
import { XRayPage } from "@/features/xray/XRayPage";
import { EngineeringGate } from "@/pages/EngineeringGate";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { useUi } from "@/store/ui";

/** The page behind every entry in NAV_ITEMS. */
const PAGES: Record<string, React.ReactNode> = {
  "/inspect": <InspectPage />,
  "/live": <LivePage />,
  "/roll": <RollsPage />,
  "/batch": <BatchPage />,
  "/history": <HistoryPage />,
  "/reports": <ReportsPage />,
  "/dashboard": <DashboardPage />,
  "/profiles": <ProfilesPage />,
  "/xray": <XRayPage />,
  "/spectrum": <SpectrumPage />,
  "/arena": <ArenaPage />,
  "/robustness": <RobustnessPage />,
  "/bit-planes": <BitPlanesPage />,
};

export default function App() {
  const location = useLocation();
  const engineering = useUi((s) => s.engineering);

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
              element={<PageTransition>{item.engineering && !engineering ? <EngineeringGate /> : PAGES[item.path]}</PageTransition>}
            />
          ))}
          <Route path="/roll/:id" element={<PageTransition><RollPage /></PageTransition>} />
          <Route path="/profiles/:id/calibration" element={<PageTransition><CalibrationPage /></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </AppShell>
  );
}
