// Whether the music is on. It always starts off: browsers won't play sound
// before the visitor has clicked, tapped or typed on the page, so there's no
// choice worth remembering between visits. Nothing plays it yet; a player will
// follow this, as the toggle sets it.

let playing = false;
const listeners = new Set<() => void>();

export function isPlaying() {
    return playing;
}

/** Turns the music on or off. */
export function setPlaying(next: boolean) {
    if (next === playing) return;
    playing = next;
    listeners.forEach((onChange) => onChange());
}

/** Calls back whenever the music is turned on or off. */
export function subscribeMusic(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}
