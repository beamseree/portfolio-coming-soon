"use client";

import { useSound } from "@/lib/use-sound";
import { cn } from "@/lib/utils";

export type Project = { year: number; title: string; note?: string };

/**
 * Projects as a list of titles grouped under their year, with an optional note
 * such as "ongoing" on the right, titled like the contributions. Projects keep
 * the order they're given in. Hovering a project, anywhere across its row,
 * fades the others, title and note alike, and plays the contribution bars'
 * click, so sweeping down the list clicks along it.
 */
export function Projects({ projects, title, className }: { projects: Project[]; title?: string; className?: string }) {
    const tap = useSound("/sounds/clean-click.wav", { pitch: -2, spread: 0.05, volume: 0.2 });
    const byYear = new Map<number, Project[]>();
    for (const project of projects) byYear.set(project.year, [...(byYear.get(project.year) ?? []), project]);

    return (
        <section className={cn("flex flex-col text-body", className)}>
            {title && <h2 className="border-b border-line pb-2 leading-[normal] text-muted transition-colors">{title}</h2>}
            <ul className="group/projects">
                {[...byYear].map(([year, group]) => (
                    <li key={year} className="flex border-line py-0.5 transition-colors not-first:border-t">
                        <span className="w-24 shrink-0 py-2 text-muted tabular-nums transition-colors">{year}</span>
                        <ul className="min-w-0 flex-1">
                            {group.map((project) => (
                                // Only where the pointer hovers, so a tap on a phone doesn't leave
                                // the list stuck faded. The hover background spans the column, from
                                // the titles to where the lines end. The title and note rest flush
                                // with its edges, lined up with the rest of the page, and slide in off
                                // them while the row is hovered. The background stops short of the
                                // row's top and bottom, clear of the lines between years.
                                <li
                                    key={project.title}
                                    onMouseEnter={tap}
                                    className="group/project relative isolate flex cursor-pointer justify-between gap-4 py-2 text-ink transition-colors before:absolute before:inset-x-0 before:inset-y-0.5 before:-z-10 before:rounded-lg before:transition-colors hover:before:bg-surface [@media(hover:hover)]:group-has-[li_li:hover]/projects:not-hover:text-faint"
                                >
                                    <span className="min-w-0 transition-[translate] group-hover/project:translate-x-2 motion-reduce:transition-none">
                                        {project.title}
                                    </span>
                                    {project.note && (
                                        <span className="shrink-0 whitespace-nowrap text-muted transition-[color,translate] group-hover/project:-translate-x-2 motion-reduce:transition-colors [@media(hover:hover)]:group-has-[li_li:hover]/projects:[li:not(:hover)>&]:text-faint">
                                            {project.note}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </section>
    );
}
