"use client";

import { themeScript } from "@/lib/theme";

/**
 * Applies the visitor's theme before first paint. Only the server-rendered copy
 * runs; on the client it's inert, since React warns about rendering scripts and
 * the theme is already on <html> by then.
 */
export function ThemeScript() {
    return (
        <script
            type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: themeScript }}
        />
    );
}
