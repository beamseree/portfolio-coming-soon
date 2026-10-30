"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { isMuted, setMuted, subscribeSound, syncSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { Speaker } from "./speaker";

/**
 * Mutes and unmutes the page's sounds. Shows the state you're in, a speaker
 * with sound waves or crossed out, and morphs from one to the other as it
 * switches.
 */
export function MuteToggle({ className }: { className?: string }) {
    // Null on the server, where the visitor's choice isn't known yet.
    const muted = useSyncExternalStore(subscribeSound, isMuted, () => null);

    // Before paint, so React's dev-only remount (which clears <html>'s
    // attributes) never shows the wrong state.
    useLayoutEffect(syncSound, []);

    return (
        <button
            type="button"
            aria-label="Mute"
            aria-pressed={muted ?? undefined}
            onClick={() => setMuted(!isMuted())}
            className={cn(
                "-m-1 cursor-pointer rounded p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
                className,
            )}
        >
            <Speaker muted={muted} className="block size-4" />
        </button>
    );
}
