"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

export function VideoWatermark() {
  const { user } = useAuth();
  const [position, setPosition] = useState({ top: "20%", left: "20%" });

  useEffect(() => {
    if (!user?.email) return;

    // Change position every 15 seconds
    const interval = setInterval(() => {
      const newTop = Math.floor(Math.random() * 60 + 20) + "%"; // Keep away from edges (20-80%)
      const newLeft = Math.floor(Math.random() * 60 + 20) + "%";
      setPosition({ top: newTop, left: newLeft });
    }, 15000);

    return () => clearInterval(interval);
  }, [user?.email]);

  if (!user?.email) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden select-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${position.top}-${position.left}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="absolute font-mono text-[10px] md:text-xs font-bold whitespace-nowrap text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
          style={{ 
            top: position.top, 
            left: position.left,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {user.email}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
