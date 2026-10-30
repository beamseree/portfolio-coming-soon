"use client";

import { useSyncExternalStore } from "react";
import { isPlaying, setPlaying, subscribeMusic } from "@/lib/music";
import { useSound } from "@/lib/use-sound";
import { cn } from "@/lib/utils";
import { PlayStop } from "./play-stop";

/**
 * Turns the music on and off. Shows a play triangle while it's off and a stop
 * square while it plays, and morphs from one to the other as it switches, with
 * a pop. Hovering it names what it does next, above.
 */
export function MusicToggle({ className }: { className?: string }) {
    // The music always starts off, so the server's guess is right too.
    const playing = useSyncExternalStore(subscribeMusic, isPlaying, () => false);
    const pop = useSound("/sounds/switch-pop.wav", { volume: 0.25 });

    return (
        <div className={cn("relative flex", className)}>
            <button
                type="button"
                aria-label="Play music"
                aria-pressed={playing}
                onClick={() => {
                    pop();
                    setPlaying(!isPlaying());
                }}
                className="peer group -m-1 cursor-pointer rounded p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
                {/* Pressing sinks the icon a little, and letting go springs it
                    back, as the other toggles' do. */}
                <PlayStop
                    playing={playing}
                    className="block size-4 transition-transform duration-150 ease-out group-active:scale-80"
                />
            </button>
            {/* Centred over the icon, or flush with its right edge on narrow
                screens, where centring would hang it past the page's gutter. It
                fades in out of a blur once the pointer has settled on the button,
                or straight away on keyboard focus, and back out when it leaves. */}
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute bottom-full right-1/2 mb-1.5 grid translate-x-1/2 justify-items-center text-xs whitespace-nowrap select-none max-sm:right-0 max-sm:translate-x-0 max-sm:justify-items-end",
                    "opacity-0 blur-xs transition-[opacity,filter] duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]",
                    "peer-hover:opacity-100 peer-hover:blur-none peer-hover:delay-200 peer-focus-visible:opacity-100 peer-focus-visible:blur-none",
                )}
            >
                {/* Both names share one spot, lined up as the label is, so a
                    click swaps them through the same blur. */}
                <span className={cn("col-start-1 row-start-1 transition-[opacity,filter]", playing && "opacity-0 blur-xs")}>
                    Play
                </span>
                <span className={cn("col-start-1 row-start-1 transition-[opacity,filter]", !playing && "opacity-0 blur-xs")}>
                    Stop
                </span>
            </span>
        </div>
    );
}
