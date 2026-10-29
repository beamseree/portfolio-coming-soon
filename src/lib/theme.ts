export type Theme = "light" | "dark";

// The theme lives on <html data-theme>, which the CSS keys off. Everything
// here reads and writes that attribute, so it's the single source of truth.

const STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "light";

/** How long the dithered scenes take to turn from day to night when the theme changes. */
export const DUSK_SECONDS = 0.5;

/**
 * Inlined in <head> so it runs before first paint: applies the visitor's saved
 * theme, or light when they haven't picked one.
 */
export const themeScript = `(function(){var t;try{t=localStorage.getItem("${STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark")t="${DEFAULT_THEME}";document.documentElement.dataset.theme=t})()`;

function savedTheme(): Theme | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

function apply(theme: Theme) {
    const root = document.documentElement;
    if (root.dataset.theme !== theme) root.dataset.theme = theme;
}

export function getTheme(): Theme {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Switches theme and remembers it as the visitor's choice. */
export function setTheme(theme: Theme) {
    apply(theme);
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
}

/** Calls back whenever the page's theme changes, however it was changed. */
export function subscribeTheme(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
}

/**
 * Re-applies the visitor's theme, then keeps it current by picking up a choice
 * made in another tab. Returns a cleanup.
 */
export function syncTheme() {
    const update = () => apply(savedTheme() ?? DEFAULT_THEME);
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) update();
    };
    update();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
