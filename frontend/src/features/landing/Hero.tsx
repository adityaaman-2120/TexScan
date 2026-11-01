import { motion } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCloth } from "./HeroCloth";

export function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-[1680px] items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:px-12 lg:pb-20 lg:pt-14 xl:gap-24">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}>
          <h1 className="font-display text-[clamp(2.9rem,5.4vw,6rem)] leading-[1]">Fabric inspection for small textile units.</h1>
          <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground xl:max-w-2xl xl:text-[19px]">
            Checking rolls by eye is slow and inconsistent, and machine-vision systems cost too much for a small unit. TexScan finds defects, measures them and grades each roll using just a computer and a camera.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button size="lg" asChild>
              <a href="/app">
                Open the app
                <ArrowRight />
              </a>
            </Button>
            <a href="#demo" className="group inline-flex items-center gap-2 text-sm font-medium outline-none focus-visible:underline">
              Try the demo
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Runs on your own computer. No cloud, no account.</p>
        </motion.div>

        <motion.figure initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}>
          <div className="relative aspect-video overflow-hidden rounded-xl bg-[#05070b]">
            <HeroCloth className="absolute inset-0 size-full" />
          </div>
          <figcaption className="mt-3 text-xs text-muted-foreground">Example: a photo of damaged fabric, with its defects marked.</figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
