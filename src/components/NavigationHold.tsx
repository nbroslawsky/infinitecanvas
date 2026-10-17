"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BusyOverlay, routeWaitCopy } from "@/components/BusyOverlay";

export function NavigationHold() {
  const pathname = usePathname();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    setDestination(null);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/api")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setDestination(url.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!destination) return null;
  const copy = routeWaitCopy(destination);
  return <BusyOverlay title={copy.title} detail={copy.detail} delay />;
}
