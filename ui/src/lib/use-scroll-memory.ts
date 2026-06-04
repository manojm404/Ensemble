import { useEffect, useRef } from "react";

export function useScrollMemory(storageKey: string) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scroller = (root.querySelector("[data-scroll-viewport]") as HTMLElement | null) || root;
    const savedValue = sessionStorage.getItem(storageKey);
    if (savedValue) {
      const next = Number(savedValue);
      if (!Number.isNaN(next)) {
        scroller.scrollTop = next;
      }
    }

    const handleScroll = () => {
      sessionStorage.setItem(storageKey, String(scroller.scrollTop));
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      sessionStorage.setItem(storageKey, String(scroller.scrollTop));
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [storageKey]);

  return rootRef;
}
