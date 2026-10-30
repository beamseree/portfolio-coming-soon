"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** How long a switch takes. Each part of it is timed against this. */
const DURATION = 500;

// In the icon's 24-unit box. The speaker's mouth opens at x 11, and its sound
// waves are quarter circles of r 5 and r 9 around (12, 12). The muted X sits
// beside it, centred on (19, 12).
const SPEAKER = "M11 5 6.5 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3.5L11 19Z";
const WAVE_RADII = [5, 9];
const CROSS: [number, number, number, number][] = [
    [16, 9, 22, 15],
    [22, 9, 16, 15],
];

/** How much wider a wave grows as it's carried away. */
const DRIFT = 3;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (value: number) => +value.toFixed(3);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

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

// The sun/moon toggle's curves: one for moving, one for springing out.
const ease = cubicBezier(0.2, 0, 0, 1);
const spring = cubicBezier(0.34, 1.56, 0.64, 1);

/** A sound wave of radius `r`. */
function wave(r: number) {
    const x = round(12 + r * Math.SQRT1_2);
    return `M${x} ${round(12 - r * Math.SQRT1_2)}A${round(r)} ${round(r)} 0 0 1 ${x} ${round(12 + r * Math.SQRT1_2)}`;
}

const WAVES = WAVE_RADII.map(wave);

/** The first `amount` (0–1) of a straight line. */
function drawn([x1, y1, x2, y2]: [number, number, number, number], amount: number) {
    return `M${x1} ${y1}L${round(mix(x1, x2, amount))} ${round(mix(y1, y2, amount))}`;
}

function scaleAbout(scale: number, x: number, y: number, turn = 0) {
    return `translate(${x} ${y}) rotate(${round(turn)}) scale(${round(Math.max(0, scale))}) translate(${-x} ${-y})`;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

// --- The morph ---

/**
 * Everything that moves, as numbers: how far each wave has grown out of the
 * speaker's mouth (0 tucked in, 1 at rest, a little over as it springs past)
 * and how far it's been carried away (0 at rest, 1 gone), then the X as a whole
 * (0 gone, 1 spun in) and how much of each of its strokes is drawn. Growing and
 * carrying away are kept apart so no frame can mistake one for the other.
 */
type Pose = {
    grown: [number, number];
    away: [number, number];
    spin: number;
    strokes: [number, number];
};

const atRest = (muted: boolean): number[] => (muted ? [1, 1, 1, 1, 1, 1, 1] : [1, 1, 0, 0, 0, 0, 0]);

const toPose = ([innerGrown, outerGrown, innerAway, outerAway, spin, first, second]: number[]): Pose => ({
    grown: [innerGrown, outerGrown],
    away: [innerAway, outerAway],
    spin,
    strokes: [first, second],
});

type Timing = {
    delay?: number;
    duration: number;
    curve?: (t: number) => number;
    /** Start over from here, even mid-way, and even if the target hasn't moved. */
    restart?: number;
};

/** When and how each number in the figure moves, on a switch to `muted`. */
function timing(muted: boolean, d: number, index: number): Timing {
    if (muted) {
        // The waves carry on out and fade, outer one first; then the X spins in whole.
        if (index < 2) return { duration: 0 };
        if (index < 4) return { delay: (3 - index) * 0.06 * d, duration: 0.45 * d };
        if (index === 4) return { delay: 0.3 * d, duration: 0.5 * d, curve: spring, restart: 0 };
        return { duration: 0 };
    }
    // The X rubs out, its second stroke first; then fresh waves spring out of
    // the speaker, inner one first.
    if (index < 2) return { delay: (0.2 + index * 0.08) * d, duration: 0.5 * d, curve: spring, restart: 0 };
    if (index < 4) return { duration: 0 };
    if (index === 4) return { delay: 0.26 * d, duration: 0 };
    return { delay: (6 - index) * 0.06 * d, duration: 0.2 * d };
}

type Tween = { from: number; to: number; start: number; delay: number; duration: number; curve: (t: number) => number };

function valueAt(tween: Tween, now: number) {
    const elapsed = now - tween.start - tween.delay;
    if (elapsed <= 0) return tween.from;
    if (elapsed >= tween.duration) return tween.to;
    return mix(tween.from, tween.to, tween.curve(elapsed / tween.duration));
}

const settled = (tween: Tween, now: number) => now >= tween.start + tween.delay + tween.duration;

/**
 * The pose for `muted`, moving there over `duration` on a switch. Each number
 * eases from wherever it had got to, so a switch back mid-way turns around
 * rather than jumping.
 */
function usePose(muted: boolean, duration: number) {
    const [tweens] = useState<Tween[]>(() =>
        atRest(muted).map((to) => ({ from: to, to, start: 0, delay: 0, duration: 0, curve: ease })),
    );
    const [values, setValues] = useState(() => atRest(muted));

    useEffect(() => {
        const now = performance.now();
        const targets = atRest(muted);
        tweens.forEach((tween, i) => {
            const { delay = 0, duration: span, curve = ease, restart } = timing(muted, duration, i);
            if (tween.to === targets[i] && restart === undefined) return;
            Object.assign(tween, { from: restart ?? valueAt(tween, now), to: targets[i], start: now, delay, duration: span, curve });
        });
        let frame = requestAnimationFrame(function step(time) {
            setValues(tweens.map((tween) => valueAt(tween, time)));
            if (!tweens.every((tween) => settled(tween, time))) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [muted, duration, tweens]);

    return toPose(values);
}

function Figure({ grown, away, spin, strokes, className }: Pose & { className?: string }) {
    const mask = useId();

    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            // The waves widen a touch past the box as they fade away.
            overflow="visible"
            aria-hidden
            className={className}
        >
            <defs>
                {/* Hides everything left of the speaker's mouth, so the waves
                    grow out from behind it. */}
                <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="-12" width="36" height="48">
                    <rect x="12" y="-12" width="24" height="48" fill="white" stroke="none" />
                </mask>
            </defs>
            <path d={SPEAKER} />
            <g mask={`url(#${mask})`}>
                {WAVE_RADII.map((radius, i) => (
                    <path
                        key={radius}
                        d={away[i] > 0 ? wave(radius + away[i] * DRIFT) : WAVES[i]}
                        transform={grown[i] === 1 ? undefined : scaleAbout(grown[i], 11, 12)}
                        opacity={clamp(grown[i] / 0.4) * clamp((1 - away[i]) * 1.5)}
                    />
                ))}
            </g>
            {spin > 0.001 && (
                <g transform={spin === 1 ? undefined : scaleAbout(spin, 19, 12, (1 - spin) * -90)} opacity={clamp(spin * 3)}>
                    {CROSS.map((line, i) => strokes[i] > 0.001 && <path key={i} d={drawn(line, strokes[i])} />)}
                </g>
            )}
        </svg>
    );
}

function Morphing({ muted, className }: { muted: boolean; className?: string }) {
    const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
    const pose = usePose(muted, reduced ? 0 : DURATION);
    return <Figure {...pose} className={className} />;
}

/**
 * A speaker: with sound waves while the page plays sounds, crossed out while
 * it's muted. On muting, the waves carry on out and fade and an X spins in. On
 * unmuting, the X rubs out stroke by stroke and fresh waves spring back out of
 * the speaker. Holds still for visitors who prefer reduced motion.
 *
 * Before hydration whether the page is muted isn't known, so both are drawn at
 * rest and CSS shows the right one.
 */
export function Speaker({ muted, className }: { muted: boolean | null; className?: string }) {
    if (muted === null) {
        return (
            <>
                <Figure {...toPose(atRest(false))} className={cn(className, "sound-off:hidden")} />
                <Figure {...toPose(atRest(true))} className={cn(className, "hidden sound-off:block")} />
            </>
        );
    }
    return <Morphing muted={muted} className={className} />;
}
