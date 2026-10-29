"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ContributionDay } from "@/lib/github";
import { useSound } from "@/lib/use-sound";
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
 * taller, its neighbours halfway, raises a tooltip with the day's count, and
 * plays a click, so sweeping across the graph clicks along it.
 */
export function ContributionGraph({ days, className }: { days: ContributionDay[]; className?: string }) {
    const [active, setActive] = useState<number | null>(null);
    const tap = useSound("/sounds/clean-click.wav", { pitch: -2, spread: 0.05, volume: 0.2 });
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
            // pointer never falls between bars and drops the tooltip. Dragging
            // across the bars would otherwise select the hidden tooltips' text.
            className={cn("@container relative -mx-[1.5px] flex select-none", className)}
            // A bar's height: as tall as it is wide, so square, until the graph
            // narrows enough to make bars slimmer than 15px. Then they only slim
            // down and keep that height, rather than shrinking to specks.
            style={{ "--bar": `max(100cqw / ${days.length || 1} - 3px, 15px)` } as CSSProperties}
        >
            {days.map((day, index) => {
                const distance = active === null ? Infinity : Math.abs(active - index);
                return (
                    <div
                        key={day.date}
                        onMouseEnter={() => {
                            setActive(index);
                            tap();
                        }}
                        // Bars stand on the bottom edge, so they stretch upward.
                        // While one is hovered, every bar's hover area reaches as
                        // high as it and the gap above it, so the pointer can sweep
                        // along the tops of the stretched bars without falling off.
                        className={cn(
                            "relative flex h-(--bar) flex-1 items-end px-[1.5px]",
                            active !== null && "before:absolute before:inset-x-0 before:bottom-0 before:h-[calc(var(--bar)*1.75_+_6px)]",
                        )}
                    >
                        {/* Each bar is drawn at its hovered height, 1.75 times
                            its resting one, and clipped down from the top: to
                            its resting height, or 1.2 times it beside the
                            hovered bar. Stretching only moves the clip, never
                            the bar's box, so its bottom edge can't shift as it
                            grows. */}
                        <div
                            style={{ animationDelay: `${index * 20}ms` }}
                            className={cn(
                                "h-[calc(var(--bar)*1.75)] w-full origin-bottom animate-bar-in transition-[clip-path] duration-100 ease-in-out motion-reduce:animate-none motion-reduce:transition-none",
                                "[clip-path:inset(calc(var(--bar)*0.75)_0_0_round_3px)]",
                                LEVELS[Math.ceil((day.count / busiest) * 4)],
                                distance === 0 && "[clip-path:inset(0_round_3px)]",
                                distance === 1 && "[clip-path:inset(calc(var(--bar)*0.55)_0_0_round_3px)]",
                                distance <= 1 && "duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)]",
                            )}
                        />
                        <div
                            ref={(tip) => {
                                tipRefs.current[index] = tip;
                            }}
                            aria-hidden
                            className={cn(
                                // 6px clear of the bar's top as it stretches.
                                "pointer-events-none absolute bottom-full left-1/2 z-10 mb-[calc(var(--bar)*0.75_+_6px)] w-max rounded-md bg-ink px-2.5 py-1.5 text-xs text-background shadow-lg",
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
