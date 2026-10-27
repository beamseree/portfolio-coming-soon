"use client";

import { useMemo, useSyncExternalStore } from "react";

type LocalTimeProps = {
    /** IANA time zone, e.g. "Asia/Bangkok". */
    timeZone: string;
    className?: string;
};

function subscribe(onTick: () => void) {
    const id = setInterval(onTick, 1000);
    return () => clearInterval(id);
}

// Nothing on the server: the time is only known in the browser, and rendering
// it there keeps the page prerenderable and free of hydration mismatches.
const getServerSnapshot = () => null;

/** The current time in a given zone, as "3:48pm", kept up to date. */
export function LocalTime({ timeZone, className }: LocalTimeProps) {
    const formatter = useMemo(
        () => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }),
        [timeZone],
    );

    const time = useSyncExternalStore(
        subscribe,
        () => {
            const parts = Object.fromEntries(formatter.formatToParts().map((part) => [part.type, part.value]));
            return `${parts.hour}:${parts.minute}${parts.dayPeriod.toLowerCase()}`;
        },
        getServerSnapshot,
    );

    return <p className={className}>{time}</p>;
}
