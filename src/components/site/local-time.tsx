"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type LocalTimeProps = {
    /** IANA time zone, e.g. "Asia/Bangkok". */
    timeZone: string;
    className?: string;
};

// Ticks just after each second turns over, so the minute flips in step with
// the system clock instead of trailing it by however far into a second we
// subscribed.
function subscribe(onTick: () => void) {
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
        id = setTimeout(() => {
            onTick();
            schedule();
        }, 1000 - (Date.now() % 1000));
    };
    schedule();
    return () => clearTimeout(id);
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

    return (
        <p className={cn("tabular-nums", className)}>
            {/* Keyed from the end, so each digit keeps its place when the hour gains one. */}
            {time && Array.from(time, (char, i) => (/\d/.test(char) ? <FlipDigit key={time.length - i} digit={char} /> : char))}
        </p>
    );
}

/**
 * A digit that changes like a flip clock: the old digit's top half folds down
 * over its bottom half, uncovering the new digit. The flap is the page
 * background, so only the numbers seem to move.
 */
function FlipDigit({ digit }: { digit: string }) {
    // The digit this one replaced. Tracked during render, not in an effect, so
    // the flap is up in the same frame as the new digit.
    const [shown, setShown] = useState(digit);
    const [previous, setPrevious] = useState(digit);
    if (digit !== shown) {
        setShown(digit);
        setPrevious(shown);
    }

    return (
        <span className="relative inline-block">
            {digit}
            {previous !== digit && (
                // A new key per change remounts the flap, restarting its
                // animations. It hides itself once the flip is over.
                <span
                    key={digit}
                    aria-hidden
                    className="pointer-events-none invisible absolute inset-0 animate-flip-hold select-none perspective-[4em] motion-reduce:hidden"
                >
                    <Half digit={previous} half="bottom" className="inset-x-0 bottom-0 h-1/2" />
                    <span className="absolute inset-x-0 top-0 h-1/2 origin-bottom animate-flip-fold transform-3d">
                        <Half digit={previous} half="top" className="inset-0 backface-hidden" />
                        <Half digit={digit} half="bottom" className="inset-0 rotate-x-180 backface-hidden" />
                    </span>
                </span>
            )}
        </span>
    );
}

/** One half of a digit, on the page background so it covers what's behind it. */
function Half({ digit, half, className }: { digit: string; half: "top" | "bottom"; className?: string }) {
    return (
        <span className={cn("absolute overflow-hidden bg-background transition-[background-color]", className)}>
            <span className={cn("absolute inset-x-0", half === "top" ? "top-0" : "bottom-0")}>{digit}</span>
        </span>
    );
}
