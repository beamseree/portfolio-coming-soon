"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, syncTheme } from "@/lib/theme";
import { useSound } from "@/lib/use-sound";
import { cn } from "@/lib/utils";
import { SunMoon } from "./sun-moon";

/**
 * Switches between the light and dark themes. Shows the theme you're in, a sun
 * by day and a moon by night, and morphs from one to the other as it switches,
 * with a pop. Hovering it names the theme it switches to, above.
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
            {/* Centred over the icon, which sits far enough in from the page's
                edge to keep it inside the gutter. It fades in out of a blur once
                the pointer has settled on the button, or straight away on
                keyboard focus, and back out when it leaves. */}
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute bottom-full right-1/2 mb-1.5 grid translate-x-1/2 justify-items-center text-xs whitespace-nowrap select-none",
                    "opacity-0 blur-xs transition-[opacity,filter] duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]",
                    "peer-hover:opacity-100 peer-hover:blur-none peer-hover:delay-200 peer-focus-visible:opacity-100 peer-focus-visible:blur-none",
                )}
            >
                {/* Both names share one spot, each centred in it, so a click
                    swaps them through the same blur, in step with the page's
                    fade between themes. CSS picks the name, so it's right before
                    hydration too. */}
                <span className="col-start-1 row-start-1 transition-[opacity,filter] dark:opacity-0 dark:blur-xs">
                    Dark
                </span>
                <span className="col-start-1 row-start-1 opacity-0 blur-xs transition-[opacity,filter] dark:opacity-100 dark:blur-none">
                    Light
                </span>
            </span>
        </div>
    );
}
