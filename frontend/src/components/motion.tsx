import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Wraps a routed page: fades and rises in, fades out on navigation (used inside AnimatePresence). */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Children wrapped in <StaggerItem> reveal one after another. */
export function Stagger({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div variants={container} initial="hidden" animate="show" className={className} {...props} />;
}

export function StaggerItem({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div variants={item} className={cn(className)} {...props} />;
}
