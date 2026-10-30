"use client";

import { soundScript } from "@/lib/sound";

/**
 * Applies the visitor's choice of sound on or off before first paint, so the
 * speaker shows the right state from the start. Only the server-rendered copy
 * runs, as with ThemeScript.
 */
export function SoundScript() {
    return (
        <script
            type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: soundScript }}
        />
    );
}
