"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const loadSheet = () => import("@/components/marketing/mobile-main-menu-sheet");

// The dialog primitives are the largest client code on marketing pages and
// most visitors never open the menu, so the panel loads on first intent
// (hover, focus, touch) rather than with the page.
const MobileMainMenuSheet = dynamic(() => loadSheet().then((m) => m.MobileMainMenuSheet), {
  ssr: false,
});

/** Accessible public navigation that reflows independently of header copy. */
export function MobileMainMenu() {
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState(false);
  const [openOnPathname, setOpenOnPathname] = useState<string | null>(null);
  const open = openOnPathname === pathname;
  const setOpen = (next: boolean) => setOpenOnPathname(next ? pathname : null);
  const prefetch = () => void loadSheet();

  return (
    <span className="shrink-0 min-[1200px]:hidden">
      <button
        ref={trigger}
        type="button"
        aria-label="Open main menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
        className="grid min-h-11 min-w-11 shrink-0 place-items-center border border-hairline-strong"
      >
        <span aria-hidden="true" className="grid gap-1">
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
        </span>
      </button>
      {requested ? (
        <MobileMainMenuSheet open={open} setOpen={setOpen} returnFocusTo={trigger} />
      ) : null}
    </span>
  );
}
