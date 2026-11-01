import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./landing.css";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { ThemeToggle } from "@/app/ThemeToggle";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useUi } from "@/store/ui";
import { Capabilities } from "./Capabilities";
import { DemoSection } from "./DemoSection";
import { Faq } from "./Faq";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Manifesto } from "./Manifesto";
import { TraceSection } from "./TraceSection";

const TAGLINE = "Affordable fabric inspection for small textile units";

const NAV: [string, string][] = [
  ["How it works", "#how"],
  ["Features", "#features"],
  ["Demo", "#demo"],
  ["Explainable", "#explainable"],
  ["FAQ", "#faq"],
];

export function LandingPage() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="landing relative min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-4 px-4 sm:px-6 lg:px-12">
          <a href="/" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring" aria-label="TexScan home">
            <LogoMark className="size-8" />
            <span className="font-display text-[26px] leading-none">TexScan</span>
          </a>
          <nav aria-label="Sections" className="ml-6 hidden items-center gap-5 lg:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild>
              <a href="/app">
                Open the app
                <ArrowRight />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <Manifesto />
        <HowItWorks />
        <Capabilities />

        <section id="demo" aria-labelledby="demo-title" className="border-y bg-muted/25 py-14 sm:py-20">
          <div className="mx-auto max-w-[1680px] scroll-mt-16 px-4 sm:px-6 lg:px-12">
            <div className="mb-10 grid items-end gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Live demo</p>
                <h2 id="demo-title" className="font-display text-[clamp(2.4rem,4.4vw,4.8rem)] leading-[1]">
                  Put a swatch <em>under the scanner.</em>
                </h2>
              </div>
              <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground md:justify-self-end">
                Pick a specimen and run it through the same inspection the app uses. The sample is generated in your browser, and nothing is saved.
              </p>
            </div>
            <DemoSection />
          </div>
        </section>

        <TraceSection />
        <Faq />

        <section className="mx-auto max-w-[1680px] px-4 pb-16 sm:px-6 lg:px-12 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-12 text-center sm:px-12 sm:py-16">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]" />
            <LogoMark className="relative mx-auto mb-6 size-12" />
            <h2 className="font-display relative text-[clamp(2.6rem,5.4vw,5.6rem)] leading-[1]">
              Try it on your <em className="text-primary">own fabric.</em>
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">Calibrate once, scan a roll and print the report.</p>
            <Button size="lg" className="relative mt-8" asChild>
              <a href="/app">
                Open the app
                <ArrowRight />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto grid max-w-[1680px] gap-10 px-4 py-12 sm:px-6 lg:px-12 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <a href="/" className="inline-flex items-center gap-2.5" aria-label="TexScan home">
              <LogoMark className="size-8" />
              <span className="font-display text-[26px] leading-none">TexScan</span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{TAGLINE}.</p>
          </div>
          <nav aria-label="Page" className="text-sm">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
            <ul className="space-y-2">
              {NAV.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Product" className="text-sm">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Product</p>
            <ul className="space-y-2">
              <li>
                <a href="/app" className="text-muted-foreground transition-colors hover:text-foreground">
                  Open the app
                </a>
              </li>
              <li>
                <a href="/app/inspect" className="text-muted-foreground transition-colors hover:text-foreground">
                  Inspect a photo
                </a>
              </li>
              <li>
                <a href="/app/roll" className="text-muted-foreground transition-colors hover:text-foreground">
                  Roll inspection
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-[1680px] px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-12">Classical image processing. Runs on your own computer: no cloud, no account.</p>
        </div>
      </footer>
    </div>
  );
}
