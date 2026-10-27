"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ContributionDay } from "@/lib/github";
import { cn } from "@/lib/utils";

// From a day off to the busiest day in view, in quarters.
const LEVELS = ["bg-contrib-0", "bg-contrib-1", "bg-contrib-2", "bg-contrib-3", "bg-contrib-4"];

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 7", for "2026-10-07". */
const formatDate = (date: string) => dateFormat.format(new Date(date));

function describe(count: number) {
    if (count === 0) return "No contributions";
    return `${count.toLocaleString("en-US")} contribution${count === 1 ? "" : "s"}`;
}

/**
 * A bar for each day, greener the busier it was. Hovering one stretches it
 * taller, its neighbours halfway, and raises a tooltip with the day's count.
 */
export function ContributionGraph({ days, className }: { days: ContributionDay[]; className?: string }) {
    const [active, setActive] = useState<number | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const tipRefs = useRef<(HTMLDivElement | null)[]>([]);
    const busiest = Math.max(1, ...days.map((day) => day.count));

    // Tooltips sit centred over their bar, which would hang past the ends of
    // the graph, so the ones near an edge are nudged back inside it.
    useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        const fit = () => {
            tipRefs.current.forEach((tip) => {
                const cell = tip?.parentElement;
                if (!tip || !cell) return;
                const center = cell.offsetLeft + cell.offsetWidth / 2;
                const half = tip.offsetWidth / 2;
                const shift = Math.max(0, half - center) - Math.max(0, center + half - row.clientWidth);
                tip.style.setProperty("--shift", `${shift}px`);
            });
        };
        const observer = new ResizeObserver(fit);
        observer.observe(row);
        return () => observer.disconnect();
    }, [days]);

    return (
        <div
            ref={rowRef}
            role="img"
            aria-label={days.length ? `Daily contributions, ${formatDate(days[0].date)} to ${formatDate(days[days.length - 1].date)}` : undefined}
            onMouseLeave={() => setActive(null)}
            // Each bar's hover area takes half of the gap on either side, so the
            // pointer never falls between bars and drops the tooltip.
            className={cn("relative -mx-[1.5px] flex", className)}
        >
            {days.map((day, index) => {
                const distance = active === null ? Infinity : Math.abs(active - index);
                return (
                    <div
                        key={day.date}
                        onMouseEnter={() => setActive(index)}
                        className="relative flex h-5 flex-1 items-center px-[1.5px]"
                    >
                        <div
                            style={{ animationDelay: `${index * 20}ms` }}
                            className={cn(
                                "h-5 w-full origin-bottom animate-bar-in rounded-[3px] transition-[height] duration-100 ease-in-out motion-reduce:animate-none motion-reduce:transition-none",
                                LEVELS[Math.ceil((day.count / busiest) * 4)],
                                distance === 0 && "h-[30px]",
                                distance === 1 && "h-[22px]",
                                distance <= 1 && "duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]",
                            )}
                        />
                        <div
                            ref={(tip) => {
                                tipRefs.current[index] = tip;
                            }}
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute bottom-full left-1/2 z-10 mb-[13px] w-max rounded-md bg-ink px-2.5 py-1.5 text-xs text-background shadow-lg",
                                "translate-x-[calc(var(--shift,0px)_-_50%)] transition-[opacity,translate] motion-reduce:transition-none",
                                active === index
                                    ? "translate-y-0 opacity-100 duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]"
                                    : "translate-y-1 opacity-0 duration-100 ease-in-out",
                            )}
                        >
                            <p>{formatDate(day.date)}</p>
                            <p className="text-muted">{describe(day.count)}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
