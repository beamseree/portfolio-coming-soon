"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { getTheme, subscribeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type DitherCutoutsProps = {
    /**
     * The plain cutouts. Every `img[data-cutout="day" | "night"]` inside is
     * redrawn, clipped to its nearest `[data-slot]`.
     */
    children: ReactNode;
    className?: string;
    /** CSS pixels per dither pixel. */
    pixelSize?: number;
    /** Film grain strength. */
    grain?: number;
    /** Colour steps per channel before ordered dithering. Fewer = coarser. */
    levels?: number;
    /** Strength of the slow light drifting across the cutouts. */
    shade?: number;
    /** Re-roll the edge speckle a few times a second, like boiling line art. */
    boil?: boolean;
    /** Seconds to turn from day to night, or back, when the theme changes. */
    dusk?: number;
};

// Room around the cutouts, in CSS pixels, so speckle on an outer edge isn't
// clipped.
const PAD = 2;

/* -------------------------------------------------------------------------- */
/*                                   Shaders                                  */
/* -------------------------------------------------------------------------- */

const VERTEX = /* glsl */ `#version 300 es
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;          // backing pixels (one per dither pixel)
uniform float uTime;        // drift time, seconds
uniform float uGrainSeed;   // steps ~12×/s
uniform float uBoilSeed;    // steps ~6×/s, or 0 when not boiling
uniform sampler2D uDayArt;  // the day cutouts, rasterised at backing size
uniform sampler2D uNightArt;
uniform float uNight;       // 0 by day, 1 at night, eased in between
uniform float uGrain;
uniform float uLevels;
uniform float uShade;

out vec4 outColor;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
    vec2 px = floor(gl_FragCoord.xy);
    vec4 day = texelFetch(uDayArt, ivec2(px), 0);
    vec4 night = texelFetch(uNightArt, ivec2(px), 0);

    // Crossfade with premultiplied colour, so where both are solid the
    // machine stays solid all the way through dusk.
    float art = mix(day.a, night.a, uNight);
    if (art <= 0.0) {
        outColor = vec4(0.0);
        return;
    }
    vec3 col = mix(day.rgb * day.a, night.rgb * night.a, uNight) / art;

    // Slow light drifting across, so the dither has tone to work on.
    vec2 p = px / uRes.y;
    col *= 1.0 + (noise(p * 2.5 + vec2(uTime * 0.12, uTime * 0.03)) - 0.5) * uShade;

    // Grain, then ordered dithering down to a few levels per channel.
    col += (hash(px + uGrainSeed * 61.7) - 0.5) * uGrain;
    float steps = uLevels - 1.0;
    col = floor(col * steps + bayer8(px)) / steps;

    // Speckled outline: only the antialiased edge pixels drop in and out, so
    // the machines keep their shape.
    float wobble = (noise(px / 3.0) - 0.5) * 0.3;
    float keep = clamp((art - 0.5) * 1.6 + 0.5 + wobble, 0.0, 1.0);
    float alpha = step(hash(px * 1.37 + uBoilSeed * 19.3), keep);

    outColor = vec4(col * alpha, alpha);
}`;

/* -------------------------------------------------------------------------- */
/*                                  Component                                 */
/* -------------------------------------------------------------------------- */

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader failed to compile");
    }
    return shader;
}

const isNight = () => (getTheme() === "dark" ? 1 : 0);

const LAYERS = ["day", "night"] as const;

/**
 * Image cutouts finished like the sky: ordered dithering, film grain and a
 * boiling, speckled outline, all on one canvas however many cutouts there are.
 * The day and night cutouts turn over with the theme, over `dusk` seconds.
 * The plain images stay underneath, for layout and as the fallback when
 * WebGL2 is unavailable, and the canvas paints from them, so nothing downloads
 * twice. Pauses off-screen and in hidden tabs, and holds a still frame when
 * the visitor prefers reduced motion.
 */
export function DitherCutouts({
    children,
    className,
    pixelSize = 1,
    grain = 0.05,
    levels = 24,
    shade = 0.15,
    boil = true,
    dusk = 0.15,
}: DitherCutoutsProps) {
    const plainRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const plain = plainRef.current;
        const canvas = canvasRef.current;
        if (!plain || !canvas) return;

        const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: false,
            premultipliedAlpha: true,
        });
        if (!gl) return;

        let program: WebGLProgram;
        let textures: (WebGLTexture | null)[] = [];
        let uniforms: Record<string, WebGLUniformLocation | null> = {};
        let ready = false;
        let cancelled = false;
        const raster = document.createElement("canvas");
        const images = [...plain.querySelectorAll<HTMLImageElement>("img[data-cutout]")];

        // Paints each theme's cutouts where they sit on the page, at the
        // canvas's backing size, one texture per theme.
        const uploadArt = () => {
            if (!ready || gl.isContextLost()) return;
            raster.width = canvas.width;
            raster.height = canvas.height;
            const ctx = raster.getContext("2d")!;
            const origin = plain.getBoundingClientRect();
            const scale = 1 / pixelSize;
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            LAYERS.forEach((layer, unit) => {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, raster.width, raster.height);
                ctx.setTransform(scale, 0, 0, scale, (PAD - origin.left) * scale, (PAD - origin.top) * scale);
                ctx.imageSmoothingQuality = "high";
                for (const image of images) {
                    if (image.dataset.cutout !== layer) continue;
                    const box = image.getBoundingClientRect();
                    const slot = image.closest("[data-slot]")?.getBoundingClientRect();
                    ctx.save();
                    if (slot) {
                        ctx.beginPath();
                        ctx.rect(slot.left, slot.top, slot.width, slot.height);
                        ctx.clip();
                    }
                    ctx.drawImage(image, box.left, box.top, box.width, box.height);
                    ctx.restore();
                }
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
            });
        };

        const setup = () => {
            program = gl.createProgram()!;
            gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) ?? "Program failed to link");
            }
            gl.useProgram(program);
            gl.bindVertexArray(gl.createVertexArray());

            textures = LAYERS.map((_, unit) => {
                const texture = gl.createTexture();
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return texture;
            });

            const names = ["uRes", "uTime", "uGrainSeed", "uBoilSeed", "uDayArt", "uNightArt", "uNight", "uGrain", "uLevels", "uShade"];
            uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
            uploadArt();
            gl.uniform1i(uniforms.uDayArt, 0);
            gl.uniform1i(uniforms.uNightArt, 1);
            gl.uniform1f(uniforms.uGrain, grain);
            gl.uniform1f(uniforms.uLevels, levels);
            gl.uniform1f(uniforms.uShade, shade);
        };

        try {
            setup();
        } catch (error) {
            console.error(error);
            return;
        }

        // Drift time only advances while playing, so pausing never jumps.
        let elapsed = 0;
        // 0 by day, 1 at night. Starts where the theme is, then walks toward it.
        let night = isNight();
        let nightTarget = night;
        const draw = () => {
            if (!ready) return;
            const { width, height } = canvas;
            gl.viewport(0, 0, width, height);
            gl.uniform2f(uniforms.uRes, width, height);
            gl.uniform1f(uniforms.uTime, elapsed);
            gl.uniform1f(uniforms.uGrainSeed, Math.floor(elapsed * 12) % 997);
            gl.uniform1f(uniforms.uBoilSeed, boil ? Math.floor(elapsed * 6) % 997 : 0);
            gl.uniform1f(uniforms.uNight, night * night * (3 - 2 * night));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let inView = true;
        let raf = 0;
        let last = 0;
        let pending = 0;

        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            pending += Math.min(now - last, 200);
            last = now;
            // A dozen frames a second keeps up with the grain; dusk needs more
            // to fade smoothly.
            const frameMs = night === nightTarget ? 1000 / 12 : 1000 / 30;
            if (pending < frameMs - 2) return;
            elapsed += pending / 1000;
            const step = pending / 1000 / dusk;
            night = nightTarget > night ? Math.min(nightTarget, night + step) : Math.max(nightTarget, night - step);
            pending = 0;
            draw();
        };

        const sync = () => {
            const run = ready && inView && !document.hidden && !reducedMotion.matches && !gl.isContextLost();
            if (run && !raf) {
                last = performance.now();
                raf = requestAnimationFrame(tick);
            } else if (!run && raf) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
        };

        const fit = (width: number, height: number) => {
            canvas.width = Math.max(1, Math.round(width / pixelSize));
            canvas.height = Math.max(1, Math.round(height / pixelSize));
            uploadArt();
            draw();
        };

        // Only swap the plain cutouts out once every one is ready to paint.
        // It's sized here too, in case this lands before the first resize.
        Promise.all(images.map((image) => image.decode()))
            .then(() => {
                if (cancelled) return;
                ready = true;
                fit(canvas.clientWidth, canvas.clientHeight);
                plain.style.opacity = "0";
                sync();
            })
            .catch((error) => console.error(error));

        const resize = new ResizeObserver(([entry]) => fit(entry.contentRect.width, entry.contentRect.height));
        resize.observe(canvas);

        const visibility = new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            sync();
        });
        visibility.observe(canvas);

        const onLost = (event: Event) => {
            event.preventDefault();
            sync();
        };
        const onRestored = () => {
            setup();
            draw();
            sync();
        };

        const unsubscribeTheme = subscribeTheme(() => {
            nightTarget = isNight();
            // Nothing's playing to carry it over (reduced motion, off-screen),
            // so cut straight to it.
            if (!raf && !gl.isContextLost()) {
                night = nightTarget;
                draw();
            }
        });

        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
        document.addEventListener("visibilitychange", sync);
        reducedMotion.addEventListener("change", sync);

        return () => {
            cancelled = true;
            unsubscribeTheme();
            cancelAnimationFrame(raf);
            resize.disconnect();
            visibility.disconnect();
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            document.removeEventListener("visibilitychange", sync);
            reducedMotion.removeEventListener("change", sync);
            // Hand back to the plain cutouts without a frame of both.
            if (!gl.isContextLost()) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            plain.style.opacity = "";
        };
    }, [pixelSize, grain, levels, shade, boil, dusk]);

    return (
        <div className={cn("relative", className)}>
            <div ref={plainRef} className="absolute inset-0">
                {children}
            </div>
            <canvas
                ref={canvasRef}
                aria-hidden
                className="pointer-events-none absolute [image-rendering:pixelated]"
                style={{ left: -PAD, top: -PAD, width: `calc(100% + ${PAD * 2}px)`, height: `calc(100% + ${PAD * 2}px)` }}
            />
        </div>
    );
}
