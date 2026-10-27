"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, syncTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICON = "absolute inset-0 size-full transition-[opacity,rotate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

/**
 * Switches between the light and dark themes: a moon by day, a sun by night.
 * Both icons are always rendered and CSS picks one, so the right one shows
 * before hydration.
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
            <span className="relative block size-4">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={cn(ICON, "dark:scale-50 dark:-rotate-90 dark:opacity-0")}
                >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={cn(ICON, "scale-50 rotate-90 opacity-0 dark:scale-100 dark:rotate-0 dark:opacity-100")}
                >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
            </span>
        </button>
    );
}
