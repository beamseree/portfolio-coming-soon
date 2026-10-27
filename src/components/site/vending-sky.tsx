import type { CSSProperties } from "react";
import Image from "next/image";
import { DitherSky } from "@/components/site/dither-sky";
import { cn } from "@/lib/utils";

// The scene is laid out in the design's own coordinates (a 550 × 216 frame) and
// placed by percentage, so the whole collage scales down as one piece on narrow
// screens instead of reflowing.
const SCENE = { width: 550, height: 216.341 };

type Box = { x: number; y: number; w: number; h: number };

type Machine = Box & {
    src: string;
    /** Where the cutout sits inside its slot, in % of the slot (the slot clips it). */
    crop: [left: number, top: number, width: number, height: number];
};

const SKY: Box = { x: -55, y: 10, w: 660, h: 195 };

const MACHINES: Machine[] = [
    // Top row
    { src: "/vending/blue-cloud.png", x: 0.179, y: 5.85, w: 65.511, h: 91.247, crop: [-9.39, -2.84, 108.69, 104.05] },
    { src: "/vending/slim-blue.png", x: 89.777, y: 9.43, w: 35.791, h: 87.465, crop: [-32.71, -0.5, 165.33, 101.48] },
    { src: "/vending/coke-on-white.png", x: 155.788, y: 5.591, w: 60.65, h: 91.576, crop: [-4.92, -4.56, 109.85, 109.12] },
    { src: "/vending/asahi-wonda-blue.png", x: 246.768, y: 10.899, w: 57.253, h: 86.269, crop: [-10.73, -3.74, 121.61, 107.61] },
    { src: "/vending/narita-airport-water.png", x: 334.353, y: 7.147, w: 48.902, h: 90.019, crop: [-7.98, -5.13, 115.95, 110.23] },
    { src: "/vending/coca-cola-jojo.png", x: 413.714, y: 7.019, w: 57.322, h: 90.077, crop: [-6.39, -0.93, 108.56, 103.63] },
    { src: "/vending/ito-en-evian-pink.png", x: 499.117, y: 0, w: 50.884, h: 97.167, crop: [-28.04, -4.76, 155.39, 108.5] },
    // Bottom row
    { src: "/vending/coca-cola-jojo-sticker.png", x: 0, y: 116.626, w: 52.228, h: 99.715, crop: [-4.72, -2.48, 109.46, 105.08] },
    { src: "/vending/suntory-nope.png", x: 81.417, y: 129.577, w: 48.336, h: 86.764, crop: [-6.71, -3.75, 113.14, 110.37] },
    { src: "/vending/dydo-orange.png", x: 158.941, y: 120.589, w: 58.668, h: 95.752, crop: [-6.14, -3.1, 112.31, 107.04] },
    { src: "/vending/good-vending-yellow.png", x: 246.798, y: 126.321, w: 55.837, h: 90.019, crop: [-13.06, -1.34, 125.87, 104.1] },
    { src: "/vending/zone-energy.png", x: 331.824, y: 137.008, w: 54.281, h: 79.333, crop: [-10.78, -7.05, 121.18, 110.55] },
    { src: "/vending/exec-catalog.png", x: 415.293, y: 123.632, w: 59.588, h: 92.709, crop: [-15.2, -5.67, 130.11, 111.5] },
    { src: "/vending/sd-japan-floral.png", x: 504.07, y: 134.672, w: 45.93, h: 81.668, crop: [-21.73, -3.12, 140.99, 105.72] },
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
            {MACHINES.map((machine) => {
                const [left, top, width, height] = machine.crop;
                return (
                    <div key={machine.src} className="absolute overflow-hidden" style={place(machine)}>
                        <div
                            className="absolute"
                            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                        >
                            <Image src={machine.src} alt="" fill sizes="110px" loading="eager" />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
