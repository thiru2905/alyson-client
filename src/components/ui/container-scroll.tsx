import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export function ContainerScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rotateX = useTransform(scrollYProgress, [0, 0.45, 1], [18, 0, -6]);
  const scale = useTransform(scrollYProgress, [0, 0.45, 1], [0.92, 1, 0.98]);
  const y = useTransform(scrollYProgress, [0, 0.45, 1], [48, 0, -12]);

  return (
    <div ref={ref} className={cn("relative perspective-[1200px]", className)}>
      <motion.div style={{ rotateX, scale, y, transformPerspective: 1200 }} className="origin-center">
        {children}
      </motion.div>
    </div>
  );
}
