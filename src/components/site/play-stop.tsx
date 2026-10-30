"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** How long a switch takes. */
const DURATION = 350;

// In the icon's 24-unit box, one outline with four rounded corners, each
// rounded off from 1.5 units along its sides. The stop square runs from (4, 4)
// to (20, 20), to carry about as much weight as the sun and moon. The play
// triangle points from (6.75, 3.5) and (6.75, 20.5) to (21, 12): taller than the
// square, since it fills only half its box and would otherwise look the smaller
// of the two, and a touch right of centre, since its weight gathers at its left
// edge. Its rounded tip is two halves of one corner, which part to become the
// square's right-hand corners as its left side moves out.
type Point = [number, number];

/** A rounded corner: in along one side at `from`, curving past `via`, out along the next at `to`. */
type Corner = { from: Point; via: Point; to: Point };

const ROUNDING = 1.5;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (value: number) => +value.toFixed(3);
const between = ([x1, y1]: Point, [x2, y2]: Point, t: number): Point => [mix(x1, x2, t), mix(y1, y2, t)];

/** `distance` from `point` toward `target`. */
function toward(point: Point, target: Point, distance: number): Point {
    return between(point, target, distance / Math.hypot(target[0] - point[0], target[1] - point[1]));
}

/** Each corner of the polygon `points`, rounded off. */
function rounded(points: Point[]) {
    return points.map((point, i): Corner => {
        const before = points[(i + points.length - 1) % points.length];
        const after = points[(i + 1) % points.length];
        return { from: toward(point, before, ROUNDING), via: point, to: toward(point, after, ROUNDING) };
    });
}

/** A corner cut in two at the middle of its curve, so it can open into two. */
function halves({ from, via, to }: Corner): [Corner, Corner] {
    const middle = between(between(from, via, 0.5), between(via, to, 0.5), 0.5);
    return [
        { from, via: between(from, via, 0.5), to: middle },
        { from: middle, via: between(via, to, 0.5), to },
    ];
}

const [TOP_LEFT, TIP, BOTTOM_LEFT] = rounded([
    [6.75, 3.5],
    [21, 12],
    [6.75, 20.5],
]);
const PLAY = [TOP_LEFT, ...halves(TIP), BOTTOM_LEFT];
const STOP = rounded([
    [4, 4],
    [20, 4],
    [20, 20],
    [4, 20],
]);

/** The outline `t` of the way from the triangle (0) to the square (1). */
function outline(t: number) {
    const at = (play: Point, stop: Point) => between(play, stop, t).map(round).join(" ");
    const corners = PLAY.map(
        ({ from, via, to }, i) => `${i ? "L" : "M"}${at(from, STOP[i].from)}Q${at(via, STOP[i].via)} ${at(to, STOP[i].to)}`,
    );
    return `${corners.join("")}Z`;
}

/** A JavaScript twin of CSS's cubic-bezier(). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
    const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    return (x: number) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (at(mid, x1, x2) < x) lo = mid;
            else hi = mid;
        }
        return at((lo + hi) / 2, y1, y2);
    };
}

// The sun/moon toggle's curve for moving.
const ease = cubicBezier(0.2, 0, 0, 1);

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/**
 * 0 while stopped and 1 while playing, eased from one to the other over
 * `duration`. A switch back mid-way turns around from wherever it had got to.
 */
function useProgress(playing: boolean, duration: number) {
    const [progress, setProgress] = useState(playing ? 1 : 0);
    const current = useRef(progress);

    useEffect(() => {
        const from = current.current;
        const to = playing ? 1 : 0;
        if (from === to) return;
        const span = duration * Math.abs(to - from);
        const start = performance.now();
        let frame = requestAnimationFrame(function step(now) {
            const t = span > 0 ? Math.min(1, Math.max(0, now - start) / span) : 1;
            current.current = mix(from, to, ease(t));
            setProgress(current.current);
            if (t < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [playing, duration]);

    return progress;
}

/**
 * A play triangle while the music's off and a stop square while it plays,
 * naming what a click does, as every player does. On a switch the triangle's
 * tip splits and squares off, and back. Holds still for visitors who prefer
 * reduced motion.
 */
export function PlayStop({ playing, className }: { playing: boolean; className?: string }) {
    const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
    const progress = useProgress(playing, reduced ? 0 : DURATION);

    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={className}
        >
            <path d={outline(progress)} />
        </svg>
    );
}
