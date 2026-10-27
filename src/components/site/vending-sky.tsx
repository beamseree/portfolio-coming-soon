import type { CSSProperties } from "react";
import Image from "next/image";
import { DitherSky } from "@/components/site/dither-sky";
import { cn } from "@/lib/utils";

// The scene is laid out in the design's own coordinates (a 550 × 216 frame) and
// placed by percentage, so the whole collage scales down as one piece on narrow
// screens instead of reflowing.
const SCENE = { width: 550, height: 216.341 };

type Box = { x: number; y: number; w: number; h: number };

/** Where a cutout sits inside its slot, in % of the slot (the slot clips it). */
type Crop = [left: number, top: number, width: number, height: number];

type Machine = Box & {
    src: string;
    crop: Crop;
    /**
     * The same machine lit for night, at `/vending/night/<name>.png`. Its crop fits
     * the night cutout over the day one: same top and height, centred across.
     */
    nightCrop: Crop;
};

const SKY: Box = { x: -55, y: 15, w: 660, h: 185 };

const MACHINES: Machine[] = [
    // Top row
    { src: "/vending/blue-cloud.png", x: 0.179, y: 5.85, w: 65.511, h: 91.247, crop: [-9.39, -2.84, 108.69, 104.05], nightCrop: [-9, -2.53, 107.76, 103.16] },
    { src: "/vending/slim-blue.png", x: 89.777, y: 9.43, w: 35.791, h: 87.465, crop: [-32.71, -0.5, 165.33, 101.48], nightCrop: [-42.9, -0.46, 185.52, 101.22] },
    { src: "/vending/coke-on-white.png", x: 155.788, y: 5.591, w: 60.65, h: 91.576, crop: [-4.92, -4.56, 109.85, 109.12], nightCrop: [-4.82, -4.41, 109.66, 108.94] },
    { src: "/vending/asahi-wonda-blue.png", x: 246.768, y: 10.899, w: 57.253, h: 86.269, crop: [-10.73, -3.74, 121.61, 107.61], nightCrop: [-10.35, -3.71, 120.62, 106.74] },
    { src: "/vending/narita-airport-water.png", x: 334.353, y: 7.147, w: 48.902, h: 90.019, crop: [-7.98, -5.13, 115.95, 110.23], nightCrop: [-7.9, -5.06, 115.8, 110.08] },
    { src: "/vending/coca-cola-jojo.png", x: 413.714, y: 7.019, w: 57.322, h: 90.077, crop: [-6.39, -0.93, 108.56, 103.63], nightCrop: [-6.56, -0.93, 108.78, 103.84] },
    { src: "/vending/ito-en-evian-pink.png", x: 499.117, y: 0, w: 50.884, h: 97.167, crop: [-28.04, -4.76, 155.39, 108.5], nightCrop: [-27.65, -4.43, 154.47, 107.85] },
    // Bottom row
    { src: "/vending/coca-cola-jojo-sticker.png", x: 0, y: 116.626, w: 52.228, h: 99.715, crop: [-4.72, -2.48, 109.46, 105.08], nightCrop: [-4.83, -2.21, 110.07, 105.67] },
    { src: "/vending/suntory-nope.png", x: 81.417, y: 129.577, w: 48.336, h: 86.764, crop: [-6.71, -3.75, 113.14, 110.37], nightCrop: [-6.7, -3.54, 112.77, 110] },
    { src: "/vending/dydo-orange.png", x: 158.941, y: 120.589, w: 58.668, h: 95.752, crop: [-6.14, -3.1, 112.31, 107.04], nightCrop: [-6.1, -2.98, 112.1, 106.84] },
    { src: "/vending/good-vending-yellow.png", x: 246.798, y: 126.321, w: 55.837, h: 90.019, crop: [-13.06, -1.34, 125.87, 104.1], nightCrop: [-12.53, -1.1, 123.56, 102.19] },
    { src: "/vending/zone-energy.png", x: 331.824, y: 137.008, w: 54.281, h: 79.333, crop: [-10.78, -7.05, 121.18, 110.55], nightCrop: [-10.55, -6.87, 120.72, 110.13] },
    { src: "/vending/exec-catalog.png", x: 415.293, y: 123.632, w: 59.588, h: 92.709, crop: [-15.2, -5.67, 130.11, 111.5], nightCrop: [-15.07, -5.49, 129.61, 111.08] },
    { src: "/vending/sd-japan-floral.png", x: 504.07, y: 134.672, w: 45.93, h: 81.668, crop: [-21.73, -3.12, 140.99, 105.72], nightCrop: [-21.07, -2.81, 140.07, 105.04] },
];

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

function place({ x, y, w, h }: Box): CSSProperties {
    return {
        left: percent(x, SCENE.width),
        top: percent(y, SCENE.height),
        width: percent(w, SCENE.width),
        height: percent(h, SCENE.height),
    };
}

function Cutout({ src, crop, className }: { src: string; crop: Crop; className: string }) {
    const [left, top, width, height] = crop;
    return (
        <div
            className={cn("absolute", className)}
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
        >
            <Image src={src} alt="" fill sizes="110px" loading="eager" />
        </div>
    );
}

/** Two rows of Japanese vending machines standing in front of the dithered sky. */
export function VendingSky({ className }: { className?: string }) {
    return (
        <div
            role="img"
            aria-label="Fourteen Japanese vending machines lined up in front of a cloudy sky"
            className={cn("relative aspect-[550/216.341] w-full", className)}
        >
            <div className="absolute" style={place(SKY)}>
                <DitherSky className="size-full" />
            </div>
            {MACHINES.map((machine) => (
                <div key={machine.src} className="absolute overflow-hidden" style={place(machine)}>
                    {/* The night machine fades in over the day one, in step with the sky's
                        dusk (DUSK_SECONDS). The day one stays visible underneath until the
                        fade ends, so the sky never shows through mid-way. */}
                    <Cutout
                        src={machine.src}
                        crop={machine.crop}
                        className="transition-[visibility] duration-500 dark:invisible motion-reduce:transition-none"
                    />
                    <Cutout
                        src={machine.src.replace("/vending/", "/vending/night/")}
                        crop={machine.nightCrop}
                        className="opacity-0 transition-opacity duration-500 ease-[ease-in-out] dark:opacity-100 motion-reduce:transition-none"
                    />
                </div>
            ))}
        </div>
    );
}
