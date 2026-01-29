
"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";

const ACTIVITY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function UserActivityTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const updateActivity = async () => {
      try {
        await apiClient.post("/user/activity");
      } catch (error) {
        console.error("Failed to update activity:", error);
      }
    };

    // Initial update
    updateActivity();

    // Periodic update
    const interval = setInterval(updateActivity, ACTIVITY_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [user]);

  return null;
}
