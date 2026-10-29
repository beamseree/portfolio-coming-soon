import { cacheLife } from "next/cache";

export type ContributionDay = {
    /** The day, as "2026-10-27". */
    date: string;
    count: number;
};

/**
 * Someone's contributions for each day of the past year, oldest first, read
 * from the calendar on their GitHub profile. Unlike the GraphQL API it needs no
 * token, but it only has daily counts, not which repos they went to.
 *
 * Null when GitHub can't be reached or its calendar can't be read, so a page
 * can leave the graph out rather than fail; that's tried again after a minute.
 */
export async function getContributions(username: string): Promise<ContributionDay[] | null> {
    "use cache";
    try {
        const days = await readCalendar(username);
        cacheLife("hours");
        return days;
    } catch (error) {
        console.error(error);
        cacheLife("minutes");
        return null;
    }
}

async function readCalendar(username: string): Promise<ContributionDay[]> {
    const response = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`);
    if (!response.ok) throw new Error(`Couldn't load ${username}'s contributions from GitHub (${response.status})`);
    const html = await response.text();

    // Each day is a <td> carrying its date, and a <tool-tip> pointing at the
    // cell's id spells out the count: "3 contributions on October 7th."
    const counts = new Map<string, number>();
    for (const [, id, label] of html.matchAll(/<tool-tip[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
        const count = label.match(/^([\d,]+) contributions?/)?.[1];
        counts.set(id, count ? Number(count.replaceAll(",", "")) : 0);
    }

    const days: ContributionDay[] = [];
    for (const [cell] of html.matchAll(/<td[^>]*\sdata-date="[^"]+"[^>]*>/g)) {
        const date = cell.match(/data-date="([^"]+)"/)![1];
        const id = cell.match(/\sid="([^"]+)"/)?.[1];
        days.push({ date, count: (id && counts.get(id)) || 0 });
    }
    if (days.length === 0) throw new Error(`GitHub's contribution calendar for ${username} has changed shape`);

    // The calendar runs down each week's column, so the cells aren't in order.
    return days.sort((a, b) => a.date.localeCompare(b.date));
}
