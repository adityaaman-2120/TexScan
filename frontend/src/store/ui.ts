import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Profile used by inspections; null = pipeline defaults. */
  profileId: number | null;
  setProfileId: (id: number | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      profileId: null,
      setProfileId: (profileId) => set({ profileId }),
    }),
    {
      name: "texscan-ui",
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed, profileId: s.profileId }),
    },
  ),
);
