"use client";

import { useEffect, useRef } from "react";
import { DUSK_SECONDS, getTheme, subscribeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type DitherSkyProps = {
    className?: string;
    /** CSS pixels per dither pixel. */
    pixelSize?: number;
    /** Width of the dissolving edge, as a fraction of the shorter side. */
    border?: number;
    /** Film grain strength. Around 0.02–0.06 reads as grain, not noise. */
    grain?: number;
    /** Colour steps per channel before ordered dithering. Fewer = coarser. */
    levels?: number;
    /** Multiplier on cloud drift. */
    speed?: number;
    /** Re-roll the edge speckle a few times a second, like boiling line art. */
    boil?: boolean;
    /** A small bird that glides across now and then (by day). */
    bird?: boolean;
    /** Seed for the cloud layout. */
    seed?: number;
    /** Shown instead when WebGL2 is unavailable. */
    fallbackSrc?: string;
};

/* -------------------------------------------------------------------------- */
/*                                Cloud layout                                */
/* -------------------------------------------------------------------------- */

// Each cloud is a pile of circular "puffs". The shader shades every puff like
// a little sphere and lets lower puffs overlap higher ones, which is what gives
// the stacked, scalloped cumulus look.

// light: 1 on the sunlit crown, falling toward 0 for puffs buried inside.
type Puff = { x: number; y: number; r: number; squash: number; light: number };

type Cloud = {
    u: number; // starting position along the wrap, 0–1
    base: number; // world y of the base
    speed: number; // world units per second
    fade: number; // how far it melts into the sky (distance haze)
    puffs: Puff[];
};

type Layer = {
    density: number; // clouds per world unit of width
    width: [number, number];
    height: [number, number];
    base: [number, number];
    speed: number;
    fade: number;
    puffs: number;
};

// Back to front. World units: 1 = frame height, so wider frames get more
// clouds rather than bigger ones.
const LAYERS: Layer[] = [
    { density: 2.1, width: [0.55, 0.8], height: [0.14, 0.2], base: [0.28, 0.5], speed: 0.013, fade: 0.2, puffs: 40 },
    { density: 1.15, width: [0.8, 1.1], height: [0.3, 0.42], base: [-0.06, 0.06], speed: 0.02, fade: 0, puffs: 60 },
    { density: 3.1, width: [0.28, 0.48], height: [0.05, 0.095], base: [-0.04, 0.06], speed: 0.029, fade: 0, puffs: 24 },
];

/** How many clouds each layer needs to fill a frame of this aspect ratio. */
function cloudCounts(aspect: number) {
    return LAYERS.map((layer) => {
        const span = aspect + (layer.width[0] + layer.width[1]) / 2;
        return Math.max(1, Math.round(layer.density * span));
    });
}

const MAX_PUFFS = 64;
const HEADER_TEXELS = 3;

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Builds one cumulus in local units (base at y = 0, centred on x = 0). A
 * silhouette of a main tower plus shoulders is filled with rows of puffs from
 * the base up, then lined with smaller puffs so the outline scallops.
 */
function growCumulus(rand: () => number, width: number, height: number, budget: number) {
    const range = (a: number, b: number) => a + (b - a) * rand();
    const halfW = width / 2;

    const towers = [{ c: range(-0.12, 0.12) * width, w: range(0.28, 0.38) * width, h: height }];
    for (let i = 0, n = 1 + Math.floor(rand() * 2); i < n; i++) {
        const side = rand() < 0.5 ? -1 : 1;
        towers.push({ c: side * range(0.18, 0.3) * width, w: range(0.15, 0.2) * width, h: height * range(0.4, 0.7) });
    }
    const ceiling = (x: number) =>
        towers.reduce((top, t) => {
            const u = (x - t.c) / t.w;
            return Math.abs(u) < 1 ? Math.max(top, t.h * (1 - u * u) ** 0.6) : top;
        }, height * 0.2 * Math.max(0, 1 - (x / halfW) ** 2));

    // Start with puffs sized to the cloud, and grow them until it fits the budget.
    let puffs: Puff[] = [];
    for (let scale = 1; ; scale *= 1.12) {
        const unit = Math.min(0.07, 0.15 * height + 0.02) * scale;
        puffs = [];
        for (let row = unit * 0.35; row < height; row += unit * range(1.0, 1.3)) {
            for (let x = -halfW + unit * range(0.3, 1); x < halfW - unit * 0.4; x += unit * range(1.3, 1.9)) {
                const r = unit * (1.5 - 0.6 * (row / height)) * range(0.75, 1.25);
                // The underside sags in the middle and curls up at the ends.
                const sag = row < unit * 1.5 ? unit * 0.6 * (1 - (x / halfW) ** 2) : 0;
                const y = row - sag + unit * range(-0.3, 0.3);
                if (y + r * 0.85 > ceiling(x)) continue;
                puffs.push({ x, y, r, squash: 1, light: 0 });
            }
        }
        for (let x = -halfW + unit * 0.5; x < halfW - unit * 0.3; ) {
            const r = unit * range(0.55, 0.95);
            puffs.push({ x, y: Math.max(r * 0.3, ceiling(x) - r * range(0.8, 0.95)), r, squash: 1, light: 0 });
            // Step along the outline, not just across it, so steep tower
            // sides stay closed.
            const slope = (ceiling(x + 0.005) - ceiling(x - 0.005)) / 0.01;
            x += (r * range(0.9, 1.25)) / Math.sqrt(1 + slope * slope);
        }
        if (puffs.length <= budget) {
            // Puffs deep under the crown sit in the cloud's own shadow; the
            // sun side (left) catches a little more.
            for (const p of puffs) {
                const depth = ceiling(p.x) - (p.y + p.r);
                const lit = 1 - depth / (unit * 4) - (p.x / halfW) * 0.2;
                p.light = Math.min(1, Math.max(0, lit));
            }
            break;
        }
    }

    // Highest first: the shader paints in order, so lower puffs end up in front.
    return puffs.sort((a, b) => b.y - a.y);
}

function buildClouds(seed: number, counts: number[]): Cloud[] {
    const rand = mulberry32(seed);
    const range = (a: number, b: number) => a + (b - a) * rand();
    return LAYERS.flatMap((layer, l) =>
        Array.from({ length: counts[l] }, (_, i) => ({
            u: (i + range(-0.25, 0.25)) / counts[l],
            base: range(...layer.base),
            speed: layer.speed * range(0.85, 1.15),
            fade: layer.fade,
            puffs: growCumulus(rand, range(...layer.width), range(...layer.height), layer.puffs),
        })),
    );
}

/** Packs clouds into an RGBA32F texture: one row per cloud, header texels then two per puff. */
function packClouds(clouds: Cloud[], seed: number) {
    const width = HEADER_TEXELS + MAX_PUFFS * 2;
    const data = new Float32Array(width * clouds.length * 4);
    clouds.forEach((cloud, row) => {
        const puffs = cloud.puffs.slice(0, MAX_PUFFS);
        // Bounds include a little slack for the puffs' breathing.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = 0;
        for (const p of puffs) {
            minX = Math.min(minX, p.x - p.r * 1.04);
            maxX = Math.max(maxX, p.x + p.r * 1.04);
            minY = Math.min(minY, p.y - p.r * p.squash * 1.04);
            maxY = Math.max(maxY, p.y + p.r * p.squash * 1.04);
        }
        const o = row * width * 4;
        data.set([cloud.u, cloud.base, cloud.speed, cloud.fade], o);
        data.set([minX, minY, maxX, maxY], o + 4);
        data.set([puffs.length, (seed * 13.37 + row * 7.1) % 100, maxY, 0], o + 8);
        puffs.forEach((p, j) => {
            data.set([p.x, p.y, p.r, p.squash, p.light, 0, 0, 0], o + (HEADER_TEXELS + j * 2) * 4);
        });
    });
    return { data, width, height: clouds.length };
}

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
uniform sampler2D uClouds;
uniform int uCloudCount;
uniform float uBorder;      // dissolve band, pixels
uniform float uGrain;
uniform float uLevels;
uniform float uBird;
uniform float uNight;       // 0 by day, 1 at night, eased in between

out vec4 outColor;

// Sampled from the reference painting.
const vec3 SKY_TOP = vec3(0.698, 0.831, 0.988);  // #B2D4FC
const vec3 SKY_LOW = vec3(0.741, 0.855, 0.992);  // #BDDAFD
const vec3 SHADE   = vec3(0.820, 0.875, 0.961);  // #D1DFF5
const vec3 MID     = vec3(0.886, 0.910, 0.957);  // #E2E8F4
const vec3 LIGHT   = vec3(0.965, 0.945, 0.910);  // #F6F1E8
const vec3 BIRD    = vec3(0.420, 0.490, 0.620);
const vec3 SUN     = vec3(-0.3, 0.8, 0.5);

// The same clouds by moonlight: dark bodies with silvery crowns.
const vec3 NIGHT_TOP   = vec3(0.039, 0.059, 0.153);  // #0A0F27
const vec3 NIGHT_LOW   = vec3(0.106, 0.141, 0.294);  // #1B244B
const vec3 NIGHT_SHADE = vec3(0.086, 0.106, 0.212);  // #161B36
const vec3 NIGHT_MID   = vec3(0.169, 0.200, 0.337);  // #2B3356
const vec3 NIGHT_LIGHT = vec3(0.373, 0.408, 0.553);  // #5F688D
const vec3 STAR        = vec3(0.925, 0.937, 1.000);
const float STAR_CELL  = 0.032;

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

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + 17.1;
        a *= 0.5;
    }
    return v;
}

float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

vec3 sky(vec2 p) {
    float h = smoothstep(0.0, 0.9, p.y);
    vec3 c = mix(mix(SKY_LOW, NIGHT_LOW, uNight), mix(SKY_TOP, NIGHT_TOP, uNight), h);
    return c +(fbm(p * 3.0 + vec2(uTime * 0.01, 0.0)) - 0.5) * 0.02;
}

// At most one star per grid cell, each twinkling on its own clock. The few
// bright ones get a little cross.
float stars(vec2 p, float pxW) {
    vec2 cell = floor(p / STAR_CELL);
    if (hash(cell + 3.7) > 0.3) return 0.0;
    vec2 at = (cell + 0.2 + 0.6 * vec2(hash(cell + 17.3), hash(cell + 41.9))) * STAR_CELL;
    vec2 d = abs(p - at) / pxW;
    float size = hash(cell + 5.1);
    float shape = step(max(d.x, d.y), 0.5);
    if (size > 0.92) shape = max(shape, step(min(d.x, d.y), 0.5) * step(max(d.x, d.y), 1.5) * 0.55);
    if (shape <= 0.0) return 0.0;
    float twinkle = 0.55 + 0.45 * sin(uTime * mix(1.0, 3.5, hash(cell + 9.7)) + hash(cell) * 40.0);
    return shape * mix(0.35, 1.0, size * size) * twinkle * smoothstep(0.08, 0.55, p.y);
}

void main() {
    vec2 px = floor(gl_FragCoord.xy);
    vec2 frag = px + 0.5;
    float pxW = 1.0 / uRes.y;           // one pixel in world units
    vec2 p = frag * pxW;                // y: 0–1 up the frame
    float aspect = uRes.x / uRes.y;

    vec3 skyCol = sky(p);
    vec3 col = skyCol;

    // Night only: stars and, now and then, a shooting star, both behind the
    // clouds.
    if (uNight > 0.0) {
        col = mix(col, STAR, stars(p, pxW) * uNight);

        float period = 9.0;
        float n = floor(uTime / period);
        float k = (uTime - n * period) / 0.9;
        if (k < 1.0 && hash(vec2(n, 3.1)) < 0.75) {
            float side = hash(vec2(n, 5.9)) < 0.5 ? -1.0 : 1.0;
            vec2 dir = normalize(vec2(side, -0.42));
            vec2 start = vec2(mix(0.15, aspect - 0.15, hash(vec2(n, 1.7))), mix(0.72, 0.95, hash(vec2(n, 2.3))));
            vec2 head = start + dir * k * 0.7;
            vec2 tail = head - dir * 0.16 * sin(k * 3.1416);
            vec2 ht = head - tail;
            float along = clamp(dot(p - tail, ht) / max(dot(ht, ht), 1e-6), 0.0, 1.0);
            float streak = clamp(1.0 - segment(p, tail, head) / pxW, 0.0, 1.0);
            col = mix(col, STAR, streak * along * along * sin(k * 3.1416) * uNight);
        }
    }

    // Clouds, back to front.
    vec3 sun = normalize(SUN);
    vec3 toneShade = mix(SHADE, NIGHT_SHADE, uNight);
    vec3 toneMid = mix(MID, NIGHT_MID, uNight);
    vec3 toneLight = mix(LIGHT, NIGHT_LIGHT, uNight);
    for (int i = 0; i < uCloudCount; i++) {
        vec4 head = texelFetch(uClouds, ivec2(0, i), 0);
        vec4 box = texelFetch(uClouds, ivec2(1, i), 0);
        vec4 meta = texelFetch(uClouds, ivec2(2, i), 0);

        float halfW = max(-box.x, box.z);
        float wrapW = aspect + 2.0 * halfW;
        float cx = fract(head.x + uTime * head.z / wrapW) * wrapW - halfW;
        vec2 lp = p - vec2(cx, head.y);
        if (lp.x < box.x || lp.x > box.z || lp.y < box.y - pxW || lp.y > box.w) continue;

        int n = int(meta.x);
        float cover = 0.0;
        vec3 cloudCol = vec3(0.0);
        for (int j = 0; j < n; j++) {
            vec4 pf = texelFetch(uClouds, ivec2(3 + j * 2, i), 0);
            float r = pf.z * (1.0 + 0.025 * sin(uTime * 0.5 + float(j) * 1.7 + meta.y));
            vec2 d = (lp - pf.xy) / vec2(r, r * pf.w);
            float len = length(d);
            float c = clamp((1.0 - len) * r * pf.w / pxW + 0.5, 0.0, 1.0);
            if (c <= 0.0) continue;

            // Sphere-shade the puff, dimmed when it is buried inside the
            // cloud or near its base, then band it into three painted tones.
            float light = texelFetch(uClouds, ivec2(4 + j * 2, i), 0).x;
            vec3 nrm = vec3(d, sqrt(max(0.0, 1.0 - len * len)));
            float height = clamp(lp.y / meta.z, 0.0, 1.0);
            float s = (dot(nrm, sun) * 0.5 + 0.5) * mix(0.55, 1.0, light);
            s += height * 0.1 - pow(1.0 - height, 3.0) * 0.15;
            s += (noise(lp * 90.0) - 0.5) * 0.05;
            vec3 shaded = mix(toneShade, toneMid, smoothstep(0.33, 0.39, s));
            shaded = mix(shaded, toneLight, smoothstep(0.58, 0.64, s));

            cloudCol = cover == 0.0 ? shaded : mix(cloudCol, shaded, c);
            cover = max(cover, c);
        }
        if (cover > 0.0) {
            cloudCol = mix(cloudCol, skyCol, head.w);
            col = mix(col, cloudCol, cover);
        }
    }

    // A bird glides across every so often, flapping in bursts. It roosts at
    // night.
    if (uBird > 0.5 && uNight < 1.0) {
        float crossing = (aspect + 0.1) / 0.08;
        float k = mod(uTime + 6.0, crossing + 12.0) / crossing;
        if (k < 1.0) {
            float span = 0.011;
            vec2 bp = vec2(mix(-0.05, aspect + 0.05, k), 0.76 + 0.025 * sin(k * 6.2832 + 1.0));
            vec2 q = (p - bp) / span;
            float flapping = smoothstep(-0.2, 0.4, sin(uTime * 0.9));
            float tip = 0.25 + 0.55 * sin(uTime * 11.0) * flapping;
            float wing = min(segment(q, vec2(0.0), vec2(-1.0, tip)), segment(q, vec2(0.0), vec2(1.0, tip)));
            float bcov = clamp(1.0 - wing * span / pxW, 0.0, 1.0);
            col = mix(col, BIRD, bcov * 0.8 * (1.0 - uNight));
        }
    }

    // Grain, then ordered dithering down to a few levels per channel.
    col += (hash(px + uGrainSeed * 61.7) - 0.5) * uGrain;
    float steps = uLevels - 1.0;
    col = floor(col * steps + bayer8(px)) / steps;

    // Dissolving edge: a wobbly rounded rect, eaten away pixel by pixel.
    vec2 halfRes = uRes * 0.5;
    float radius = uBorder * 2.5;
    vec2 e = abs(frag - halfRes) - (halfRes - radius);
    float inside = -(length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - radius);
    float wobble = (fbm(frag / (uBorder * 2.5)) - 0.5) * uBorder * 1.4
                 + (noise(frag / (uBorder * 0.4)) - 0.5) * uBorder * 0.5;
    float t = clamp((inside - uBorder * 0.65 + wobble) / uBorder, 0.0, 1.0);
    float keep = t;
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

/**
 * Animated painted sky: cumulus clouds drifting in parallax layers, finished
 * with ordered dithering, film grain and a speckled, dissolving edge. Follows
 * the site theme, turning to a starry night in the dark theme. Fills
 * its parent. Pauses off-screen and in hidden tabs, and holds a still frame
 * when the visitor prefers reduced motion.
 */
export function DitherSky({
    className,
    pixelSize = 1,
    border = 0.045,
    grain = 0.035,
    levels = 24,
    speed = 1,
    boil = true,
    bird = true,
    seed = 4,
    fallbackSrc = "/sky/clouds.webp",
}: DitherSkyProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fallbackRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Swap to the still image. Its src is only set here, so it never
        // downloads when WebGL works.
        const fallBack = () => {
            canvas.hidden = true;
            const image = fallbackRef.current;
            if (image) {
                image.src = fallbackSrc;
                image.hidden = false;
            }
        };

        const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: false,
            premultipliedAlpha: true,
        });
        if (!gl) {
            fallBack();
            return;
        }

        let program: WebGLProgram;
        let texture: WebGLTexture | null = null;
        let uniforms: Record<string, WebGLUniformLocation | null> = {};
        let clouds: ReturnType<typeof packClouds> | null = null;
        let layoutKey = "";

        const uploadClouds = () => {
            if (!clouds) return;
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, clouds.width, clouds.height, 0, gl.RGBA, gl.FLOAT, clouds.data);
            gl.uniform1i(uniforms.uCloudCount, clouds.height);
        };

        // Rebuilt only when the frame's shape needs a different number of clouds.
        const layoutClouds = (aspect: number) => {
            const counts = cloudCounts(aspect);
            if (counts.join() === layoutKey) return;
            layoutKey = counts.join();
            clouds = packClouds(buildClouds(seed, counts), seed);
            uploadClouds();
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

            const names = ["uRes", "uTime", "uGrainSeed", "uBoilSeed", "uClouds", "uCloudCount", "uBorder", "uGrain", "uLevels", "uBird", "uNight"];
            uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
            uploadClouds();
            gl.uniform1i(uniforms.uClouds, 0);
            gl.uniform1f(uniforms.uGrain, grain);
            gl.uniform1f(uniforms.uLevels, levels);
            gl.uniform1f(uniforms.uBird, bird ? 1 : 0);
        };

        try {
            setup();
        } catch (error) {
            console.error(error);
            fallBack();
            return;
        }

        // Drift time only advances while playing, so pausing never jumps.
        let elapsed = 0;
        // 0 by day, 1 at night. Starts where the theme is, then walks toward it.
        let night = isNight();
        let nightTarget = night;
        const draw = () => {
            const { width, height } = canvas;
            gl.viewport(0, 0, width, height);
            gl.uniform2f(uniforms.uRes, width, height);
            gl.uniform1f(uniforms.uBorder, border * Math.min(width, height));
            gl.uniform1f(uniforms.uTime, elapsed * speed);
            gl.uniform1f(uniforms.uGrainSeed, Math.floor(elapsed * 12) % 997);
            gl.uniform1f(uniforms.uBoilSeed, boil ? Math.floor(elapsed * 6) % 997 : 0);
            gl.uniform1f(uniforms.uNight, night * night * (3 - 2 * night));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const frameMs = 1000 / 30;
        let inView = true;
        let raf = 0;
        let last = 0;
        let pending = 0;

        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            pending += Math.min(now - last, 100);
            last = now;
            if (pending < frameMs - 2) return;
            elapsed += pending / 1000;
            const step = pending / 1000 / DUSK_SECONDS;
            night = nightTarget > night ? Math.min(nightTarget, night + step) : Math.max(nightTarget, night - step);
            pending = 0;
            draw();
        };

        const sync = () => {
            const run = inView && !document.hidden && !reducedMotion.matches && !gl.isContextLost();
            if (run && !raf) {
                last = performance.now();
                raf = requestAnimationFrame(tick);
            } else if (!run && raf) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
        };

        const resize = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            canvas.width = Math.max(1, Math.round(width / pixelSize));
            canvas.height = Math.max(1, Math.round(height / pixelSize));
            if (gl.isContextLost()) return;
            layoutClouds(canvas.width / canvas.height);
            draw();
        });
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
        sync();

        return () => {
            unsubscribeTheme();
            cancelAnimationFrame(raf);
            resize.disconnect();
            visibility.disconnect();
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            document.removeEventListener("visibilitychange", sync);
            reducedMotion.removeEventListener("change", sync);
        };
    }, [pixelSize, border, grain, levels, speed, boil, bird, seed, fallbackSrc]);

    return (
        <div className={cn("relative", className)}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label="Clouds drifting across the sky"
                className="absolute inset-0 size-full [image-rendering:pixelated]"
            />
            {/* The still is a day sky; dimmed, it passes for night. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={fallbackRef}
                hidden
                alt="Clouds across the sky"
                className="absolute inset-0 size-full rounded-lg object-cover dark:brightness-[0.35] dark:saturate-150"
            />
        </div>
    );
}
