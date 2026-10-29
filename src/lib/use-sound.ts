"use client";

import { useCallback, useEffect, useRef } from "react";

// One context plays every sound on the page. A context made before the page
// has been clicked, tapped or typed on starts out blocked, so it's made on the
// first of those instead, and woken on the next if the browser suspends it.
let context: AudioContext | undefined;

function wake() {
    if (!context) context = new AudioContext();
    else if (context.state === "suspended") void context.resume();
}

let listening = false;

function listen() {
    if (listening) return;
    listening = true;
    if (navigator.userActivation?.hasBeenActive) wake();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
}

// Decoding needn't wait for the page to be interacted with, so each sound is
// decoded offline as soon as it's asked for, and kept.
const buffers = new Map<string, Promise<AudioBuffer>>();

function load(src: string) {
    let buffer = buffers.get(src);
    if (!buffer) {
        buffer = fetch(src)
            .then((response) => response.arrayBuffer())
            .then((data) => new OfflineAudioContext(1, 1, 48000).decodeAudioData(data));
        buffers.set(src, buffer);
    }
    return buffer;
}

export type SoundOptions = {
    /** Semitones above or below the recording. */
    pitch?: number;
    /**
     * How much faster or slower each play may be, at random, which lifts or
     * drops its pitch with it: 0.1 for up to 10% either way.
     */
    spread?: number;
    volume?: number;
};

/**
 * Returns a function that plays a short sound, like a click. Browsers keep a
 * page silent until someone clicks, taps or types on it, so plays before then
 * go unheard.
 */
export function useSound(src: string, { pitch = 0, spread = 0, volume = 1 }: SoundOptions = {}) {
    const buffer = useRef<AudioBuffer | null>(null);

    useEffect(() => {
        listen();
        let current = true;
        buffer.current = null;
        void load(src).then((loaded) => {
            if (current) buffer.current = loaded;
        });
        return () => {
            current = false;
        };
    }, [src]);

    return useCallback(() => {
        const audio = context;
        // Plays started while suspended would all go off at once on waking.
        if (!buffer.current || audio?.state !== "running") return;

        const source = audio.createBufferSource();
        source.buffer = buffer.current;
        source.playbackRate.value = 2 ** (pitch / 12) * (1 + (Math.random() * 2 - 1) * spread);
        const gain = audio.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(audio.destination);
        source.start();
    }, [pitch, spread, volume]);
}
