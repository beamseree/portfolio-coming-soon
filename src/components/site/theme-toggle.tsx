"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, syncTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SunMoon } from "./sun-moon";

/**
 * Switches between the light and dark themes. Shows the theme you're in, a sun
 * by day and a moon by night, and morphs from one to the other as it switches.
 */
export function ThemeToggle({ className }: { className?: string }) {
    // Null on the server, where the theme isn't known yet.
    const theme = useSyncExternalStore(subscribeTheme, getTheme, () => null);

    // Before paint, so React's dev-only remount (which clears <html>'s
    // attributes) never shows the wrong theme.
    useLayoutEffect(syncTheme, []);

    return (
        <button
            type="button"
            aria-label="Dark mode"
            aria-pressed={theme ? theme === "dark" : undefined}
            onClick={() => setTheme(getTheme() === "dark" ? "light" : "dark")}
            className={cn(
                "-m-1 cursor-pointer rounded p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
                className,
            )}
        >
            <SunMoon theme={theme} className="block size-4" />
        </button>
    );
}
