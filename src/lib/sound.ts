// Whether the page plays sounds lives on <html data-sound>, "on" or "off", like
// the theme does on data-theme. Everything here reads and writes that
// attribute, so it's the single source of truth.

const STORAGE_KEY = "sound";

/**
 * Inlined in <head> so it runs before first paint: applies the visitor's saved
 * choice, or sound on when they haven't made one.
 */
export const soundScript = `(function(){var s;try{s=localStorage.getItem("${STORAGE_KEY}")}catch(e){}document.documentElement.dataset.sound=s==="off"?"off":"on"})()`;

function savedMuted() {
    try {
        return localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
        return false;
    }
}

function apply(muted: boolean) {
    const root = document.documentElement;
    const sound = muted ? "off" : "on";
    if (root.dataset.sound !== sound) root.dataset.sound = sound;
}

export function isMuted() {
    return document.documentElement.dataset.sound === "off";
}

/** Mutes or unmutes the page, and remembers it as the visitor's choice. */
export function setMuted(muted: boolean) {
    apply(muted);
    try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
    } catch {}
}

/** Calls back whenever the page is muted or unmuted, however it was done. */
export function subscribeSound(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sound"] });
    return () => observer.disconnect();
}

/**
 * Re-applies the visitor's choice, then keeps it current by picking up one made
 * in another tab. Returns a cleanup.
 */
export function syncSound() {
    const update = () => apply(savedMuted());
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) update();
    };
    update();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
