import { ContributionGraph } from "@/components/site/contribution-graph";
import { getContributions } from "@/lib/github";
import { cn } from "@/lib/utils";

const DAYS_SHOWN = 30;

const total = (days: { count: number }[]) => days.reduce((sum, day) => sum + day.count, 0);

function Stat({ label, count }: { label: string; count: number }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt>{label}</dt>
            <dd className="tabular-nums">
                {count.toLocaleString("en-US")} contribution{count === 1 ? "" : "s"}
            </dd>
        </div>
    );
}

/**
 * A GitHub user's last month of contributions as a bar per day, with totals,
 * under an optional title. Renders nothing, title included, when GitHub can't
 * be read.
 */
export async function GitHubContributions({
    username,
    title,
    className,
}: {
    username: string;
    title?: string;
    className?: string;
}) {
    const days = await getContributions(username);
    if (!days) return null;
    // GitHub's calendar ends today, so its last day says what year it is.
    const year = days[days.length - 1].date.slice(0, 4);
    const recent = days.slice(-DAYS_SHOWN);

    return (
        <section className={cn("flex flex-col gap-4 text-body", className)}>
            {title && <h2 className="border-b border-line pb-2 leading-[normal] text-muted">{title}</h2>}
            <ContributionGraph days={recent} />
            <dl className="flex flex-col gap-1 text-muted">
                <Stat label={`Last ${DAYS_SHOWN} days`} count={total(recent)} />
                <Stat label="Year to date" count={total(days.filter((day) => day.date.startsWith(year)))} />
            </dl>
        </section>
    );
}
