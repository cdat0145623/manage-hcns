"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";

export function PageProgress() {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const handleStart = () => setIsAnimating(true);
    const handleStop = () => setIsAnimating(false);

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
    };
  }, [router]);

  return (
    <AnimatePresence>
      {isAnimating && (
        <motion.div
          initial={{ width: "0%", opacity: 1 }}
          animate={{ 
            width: "90%",
            transition: { duration: 8, ease: "easeOut" }
          }}
          exit={{ 
            width: "100%", 
            opacity: 0,
            transition: { duration: 0.3 }
          }}
          className="fixed left-0 top-0 z-[10000] h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]"
        />
      )}
    </AnimatePresence>
  );
}
