"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type DitherWordmarkProps = {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
    /** CSS pixels per dither pixel. */
    pixelSize?: number;
    /** Film grain strength. */
    grain?: number;
    /** Colour steps per channel before ordered dithering. Fewer = coarser. */
    levels?: number;
    /** Strength of the slow light drifting through the fill. */
    shade?: number;
    /** Re-roll the edge speckle a few times a second, like boiling line art. */
    boil?: boolean;
};

// Room around the artwork, in CSS pixels, so speckle on the outer edge of the
// first and last glyphs isn't clipped.
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
uniform sampler2D uMask;    // the artwork, rasterised at backing size
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
    vec4 art = texelFetch(uMask, ivec2(px), 0);
    if (art.a <= 0.0) {
        outColor = vec4(0.0);
        return;
    }
    vec3 col = art.rgb;

    // Slow light drifting through the fill, so the dither has tone to work on.
    vec2 p = px / uRes.y;
    col *= 1.0 + (noise(p * 2.5 + vec2(uTime * 0.12, uTime * 0.03)) - 0.5) * uShade;

    // Grain, then ordered dithering down to a few levels per channel.
    col += (hash(px + uGrainSeed * 61.7) - 0.5) * uGrain;
    float steps = uLevels - 1.0;
    col = floor(col * steps + bayer8(px)) / steps;

    // Speckled outline: only the antialiased edge pixels drop in and out, so
    // the glyphs keep their shape.
    float wobble = (noise(px / 3.0) - 0.5) * 0.3;
    float keep = clamp((art.a - 0.5) * 1.6 + 0.5 + wobble, 0.0, 1.0);
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

/**
 * A logo or wordmark finished like the sky: ordered dithering, film grain and a
 * boiling, speckled outline. The plain image stays underneath, for layout, for
 * screen readers and as the fallback when WebGL2 is unavailable. Pauses
 * off-screen and in hidden tabs, and holds a still frame when the visitor
 * prefers reduced motion.
 */
export function DitherWordmark({
    src,
    alt,
    width,
    height,
    className,
    pixelSize = 1,
    grain = 0.05,
    levels = 24,
    shade = 0.25,
    boil = true,
}: DitherWordmarkProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const image = imageRef.current;
        if (!canvas || !image) return;

        const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: false,
            premultipliedAlpha: true,
        });
        if (!gl) return;

        let program: WebGLProgram;
        let texture: WebGLTexture | null = null;
        let uniforms: Record<string, WebGLUniformLocation | null> = {};
        let art: HTMLImageElement | null = null;
        let cancelled = false;
        const raster = document.createElement("canvas");

        // Draws the artwork into the mask at the canvas's backing size.
        const uploadMask = () => {
            if (!art || gl.isContextLost()) return;
            raster.width = canvas.width;
            raster.height = canvas.height;
            const ctx = raster.getContext("2d")!;
            const inset = PAD / pixelSize;
            ctx.clearRect(0, 0, raster.width, raster.height);
            ctx.drawImage(art, inset, inset, raster.width - inset * 2, raster.height - inset * 2);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
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

            texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            const names = ["uRes", "uTime", "uGrainSeed", "uBoilSeed", "uMask", "uGrain", "uLevels", "uShade"];
            uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
            uploadMask();
            gl.uniform1i(uniforms.uMask, 0);
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
        const draw = () => {
            if (!art) return;
            const { width, height } = canvas;
            gl.viewport(0, 0, width, height);
            gl.uniform2f(uniforms.uRes, width, height);
            gl.uniform1f(uniforms.uTime, elapsed);
            gl.uniform1f(uniforms.uGrainSeed, Math.floor(elapsed * 12) % 997);
            gl.uniform1f(uniforms.uBoilSeed, boil ? Math.floor(elapsed * 6) % 997 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        // Nothing here moves faster than the grain, so there's no need for more.
        const frameMs = 1000 / 12;
        let inView = true;
        let raf = 0;
        let last = 0;
        let pending = 0;

        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            pending += Math.min(now - last, 200);
            last = now;
            if (pending < frameMs - 2) return;
            elapsed += pending / 1000;
            pending = 0;
            draw();
        };

        const sync = () => {
            const run = !!art && inView && !document.hidden && !reducedMotion.matches && !gl.isContextLost();
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
            uploadMask();
            draw();
        };

        // Only swap the plain image out once the canvas has something to show.
        // It's sized here too, in case this lands before the first resize.
        const loader = new window.Image();
        loader.src = src;
        loader
            .decode()
            .then(() => {
                if (cancelled) return;
                art = loader;
                fit(canvas.clientWidth, canvas.clientHeight);
                image.style.opacity = "0";
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

        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
        document.addEventListener("visibilitychange", sync);
        reducedMotion.addEventListener("change", sync);

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            resize.disconnect();
            visibility.disconnect();
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            document.removeEventListener("visibilitychange", sync);
            reducedMotion.removeEventListener("change", sync);
            // Hand back to the plain image without a frame of both.
            if (!gl.isContextLost()) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            image.style.opacity = "";
        };
    }, [src, pixelSize, grain, levels, shade, boil]);

    return (
        <div className={cn("relative", className)}>
            <Image ref={imageRef} src={src} alt={alt} width={width} height={height} preload className="block h-auto w-full" />
            <canvas
                ref={canvasRef}
                aria-hidden
                className="pointer-events-none absolute [image-rendering:pixelated]"
                style={{ left: -PAD, top: -PAD, width: `calc(100% + ${PAD * 2}px)`, height: `calc(100% + ${PAD * 2}px)` }}
            />
        </div>
    );
}
