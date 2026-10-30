"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** How long the shadow takes to swing in across the sun, and back out. */
const DURATION = 500;

/**
 * How long the disc takes to swell to the moon's size, or shrink back to the
 * sun's. It starts on the click, without waiting, so the icon answers at once.
 */
const GROW = 200;

/**
 * How long the shadow holds before it swings. The page fades to the new theme
 * over 150ms (globals.css), and most of the swing's movement comes early, so
 * starting together would spend it in the flash. Waiting that out plays it
 * against the new theme.
 */
const WAIT = 150;

// The disc, shadow and turn all move on one curve, each on its own clock. The
// rays spring back out at sunrise.
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// In the icon's 24-unit box. The sun's disc is r 4, the moon's r 9. The moon's
// bite is a round shadow of r 7 resting at (17, 7); by day it waits 10 units
// further off the top-right corner.
const SUN_RADIUS = 4;
const MOON_RADIUS = 9;
const SHADOW_RADIUS = 7;
const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (value: number) => +value.toFixed(3);

/** A JavaScript twin of CSS's cubic-bezier(), so the parts drawn each frame keep pace with the CSS ones. */
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

const ease = cubicBezier(0.2, 0, 0, 1);

/**
 * The outline of the disc (centred on 12, 12) with the shadow taken out of it:
 * the disc's edge where the shadow isn't, then the shadow's edge back across
 * the disc. One path, so the moon's horns come to clean, rounded points. A whole
 * circle while the two don't meet.
 */
function crescent(radius: number, shadowX: number, shadowY: number) {
    const dx = shadowX - 12;
    const dy = shadowY - 12;
    const apart = Math.hypot(dx, dy);
    const r = round(radius);
    if (apart >= radius + SHADOW_RADIUS) {
        return `M${round(12 + radius)} 12A${r} ${r} 0 1 1 ${round(12 - radius)} 12A${r} ${r} 0 1 1 ${round(12 + radius)} 12Z`;
    }

    // The edges cross either side of the line between the centres, by the
    // half-angle each circle's edge spends inside the other.
    const cos = (v: number) => Math.acos(Math.min(1, Math.max(-1, v)));
    const toward = Math.atan2(dy, dx);
    const onDisc = cos((radius ** 2 + apart ** 2 - SHADOW_RADIUS ** 2) / (2 * radius * apart));
    const onShadow = cos((SHADOW_RADIUS ** 2 + apart ** 2 - radius ** 2) / (2 * SHADOW_RADIUS * apart));
    const startX = round(12 + radius * Math.cos(toward + onDisc));
    const startY = round(12 + radius * Math.sin(toward + onDisc));
    const endX = round(12 + radius * Math.cos(toward - onDisc));
    const endY = round(12 + radius * Math.sin(toward - onDisc));
    const longWayRound = onDisc < Math.PI / 2 ? 1 : 0;
    const deepBite = onShadow > Math.PI / 2 ? 1 : 0;

    return `M${startX} ${startY}A${r} ${r} 0 ${longWayRound} 1 ${endX} ${endY}A${SHADOW_RADIUS} ${SHADOW_RADIUS} 0 ${deepBite} 0 ${startX} ${startY}Z`;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/**
 * 0 by day and 1 by night, eased from one to the other over `duration` once
 * `wait` has passed. A switch back mid-way turns around from wherever it had
 * got to.
 */
function useProgress(dark: boolean, duration: number, wait: number) {
    const [progress, setProgress] = useState(dark ? 1 : 0);
    const current = useRef(progress);

    useEffect(() => {
        const from = current.current;
        const to = dark ? 1 : 0;
        if (from === to) return;
        const span = duration * Math.abs(to - from);
        const start = performance.now() + wait;
        let frame = requestAnimationFrame(function step(now) {
            const t = span > 0 ? Math.min(1, Math.max(0, now - start) / span) : 1;
            current.current = mix(from, to, ease(t));
            setProgress(current.current);
            if (t < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [dark, duration, wait]);

    return progress;
}

// By night the rays draw into the disc one after another as it swells. By day
// they wait for the shadow to clear, then spring back out.
function rayStyle(dark: boolean, duration: number, wait: number, index: number): CSSProperties {
    const delay = dark ? index * 0.03 * duration : wait + (0.25 + index * 0.04) * duration;
    return {
        transformOrigin: "12px 12px",
        transform: dark ? "scale(0)" : "scale(1)",
        opacity: dark ? 0 : 1,
        transition: dark
            ? `transform ${duration * 0.5}ms ${EASE} ${delay}ms, opacity ${duration * 0.3}ms linear ${delay}ms`
            : `transform ${duration * 0.6}ms ${SPRING} ${delay}ms, opacity ${duration * 0.2}ms linear ${delay}ms`,
    };
}

type FigureProps = {
    dark: boolean;
    /** The disc's size: 0 for the sun's, 1 for the moon's. */
    grow: number;
    /** The shadow and turn: 0 for the sun, 1 for the moon. */
    progress: number;
    duration: number;
    wait: number;
    className?: string;
};

function Figure({ dark, grow, progress, duration, wait, className }: FigureProps) {
    const mask = useId();
    const radius = mix(SUN_RADIUS, MOON_RADIUS, grow);
    const away = 1 - progress;

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
            <defs>
                {/* Covers the disc's inside, so the rays tuck in behind its edge
                    rather than showing through the hollow. */}
                <mask id={mask} maskUnits="userSpaceOnUse" x="-12" y="-12" width="48" height="48">
                    <rect x="-12" y="-12" width="48" height="48" fill="white" stroke="none" />
                    <circle cx="12" cy="12" r={round(radius + 1)} fill="black" stroke="none" />
                </mask>
            </defs>
            {/* The whole icon turns a quarter on the way, so the shadow swings in
                on a curve rather than a straight line. */}
            <g transform={`rotate(${round(90 * away)} 12 12)`}>
                <path d={crescent(radius, 17 + 10 * away, 7 - 10 * away)} />
                <g mask={`url(#${mask})`}>
                    {RAY_ANGLES.map((angle, i) => (
                        <g key={angle} transform={`rotate(${angle} 12 12)`}>
                            <line x1="12" y1="4" x2="12" y2="2" style={rayStyle(dark, duration, wait, i)} />
                        </g>
                    ))}
                </g>
            </g>
        </svg>
    );
}

function Morphing({ dark, className }: { dark: boolean; className?: string }) {
    const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
    const duration = reduced ? 0 : DURATION;
    const wait = reduced ? 0 : WAIT;
    const grow = useProgress(dark, reduced ? 0 : GROW, 0);
    const progress = useProgress(dark, duration, wait);
    return (
        <Figure dark={dark} grow={grow} progress={progress} duration={duration} wait={wait} className={className} />
    );
}

/**
 * A sun by day and a moon by night. On a switch, the sun swells to the moon's
 * size as its rays tuck away, then a shadow swings in across it and bites out
 * the crescent, and back again.
 * Holds still for visitors who prefer reduced motion.
 *
 * Before hydration the theme isn't known, so both are drawn at rest and CSS
 * shows the right one.
 */
export function SunMoon({ theme, className }: { theme: Theme | null; className?: string }) {
    if (!theme) {
        return (
            <>
                <Figure dark={false} grow={0} progress={0} duration={0} wait={0} className={cn(className, "dark:hidden")} />
                <Figure dark grow={1} progress={1} duration={0} wait={0} className={cn(className, "hidden dark:block")} />
            </>
        );
    }
    return <Morphing dark={theme === "dark"} className={className} />;
}
