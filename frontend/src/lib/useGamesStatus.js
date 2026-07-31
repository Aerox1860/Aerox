import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Poll public /games/status every 10s.
 * Returns { crash: bool, roulette: bool, ready: bool }
 */
export function useGamesStatus(intervalMs = 10000) {
  const [status, setStatus] = useState({ crash: true, roulette: true, ready: false });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/games/status");
        if (!alive) return;
        setStatus({ crash: !!data.crash, roulette: !!data.roulette, ready: true });
      } catch {
        if (alive) setStatus((s) => ({ ...s, ready: true }));
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  return status;
}
