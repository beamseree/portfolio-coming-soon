import type { Metadata } from "next";
import { GitHubContributions } from "@/components/site/github-contributions";

export const metadata: Metadata = {
  title: "Contributions",
  robots: { index: false },
};

// A blank page to look at the contributions graph on its own.
export default function Contributions() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-20">
      <GitHubContributions username="beamseree" className="w-full max-w-[320px]" />
    </main>
  );
}
