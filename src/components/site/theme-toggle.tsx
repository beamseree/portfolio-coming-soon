"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, syncTheme } from "@/lib/theme";
import { useSound } from "@/lib/use-sound";
import { cn } from "@/lib/utils";
import { SunMoon } from "./sun-moon";

/**
 * Switches between the light and dark themes. Shows the theme you're in, a sun
 * by day and a moon by night, and morphs from one to the other as it switches,
 * with a pop. Hovering it names the theme it switches to, underneath.
 */
export function ThemeToggle({ className }: { className?: string }) {
    // Null on the server, where the theme isn't known yet.
    const theme = useSyncExternalStore(subscribeTheme, getTheme, () => null);
    const pop = useSound("/sounds/switch-pop.wav", { volume: 0.25 });

    // Before paint, so React's dev-only remount (which clears <html>'s
    // attributes) never shows the wrong theme.
    useLayoutEffect(syncTheme, []);

    return (
        <div className={cn("relative flex", className)}>
            <button
                type="button"
                aria-label="Dark mode"
                aria-pressed={theme ? theme === "dark" : undefined}
                onClick={() => {
                    pop();
                    setTheme(getTheme() === "dark" ? "light" : "dark");
                }}
                className="peer group -m-1 cursor-pointer rounded p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
                {/* Pressing sinks the icon a little, and letting go springs it back,
                    just before it starts to morph. */}
                <SunMoon
                    theme={theme}
                    className="block size-4 transition-transform duration-150 ease-out group-active:scale-80"
                />
            </button>
            {/* Centred under the icon, or flush with its right edge on narrow
                screens, where centring would hang it past the page's gutter. It
                fades in out of a blur once the pointer has settled on the button,
                or straight away on keyboard focus, and back out when it leaves. */}
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute top-full right-1/2 mt-1.5 grid translate-x-1/2 text-xs whitespace-nowrap select-none max-sm:right-0 max-sm:translate-x-0",
                    "opacity-0 blur-xs transition-[opacity,filter] duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]",
                    "peer-hover:opacity-100 peer-hover:blur-none peer-hover:delay-200 peer-focus-visible:opacity-100 peer-focus-visible:blur-none",
                )}
            >
                {/* Both names share one spot, so a click swaps them through the
                    same blur, in step with the page's fade between themes. CSS
                    picks the name, so it's right before hydration too. */}
                <span className="col-start-1 row-start-1 transition-[opacity,filter] dark:opacity-0 dark:blur-xs">
                    Dark mode
                </span>
                <span className="col-start-1 row-start-1 opacity-0 blur-xs transition-[opacity,filter] dark:opacity-100 dark:blur-none">
                    Light mode
                </span>
            </span>
        </div>
    );
}
