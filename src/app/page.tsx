import { DitherWordmark } from "@/components/site/dither-wordmark";
import { GitHubContributions } from "@/components/site/github-contributions";
import { LocalTime } from "@/components/site/local-time";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { VendingSky } from "@/components/site/vending-sky";

function TextLink({ href, children }: { href: string; children: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="-mx-0.5 rounded-xs px-0.5 text-ink underline decoration-underline decoration-1 underline-offset-2 transition-[text-decoration-color] duration-200 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </a>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center overflow-x-clip px-4 pt-20 pb-20">
      <div className="flex w-full max-w-[550px] flex-col gap-4 text-body text-ink">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 whitespace-nowrap leading-[normal]">
            <h1>Beam Sereeyothin</h1>
            <p className="text-muted">Engineer &amp; Designer</p>
          </div>
          <DitherWordmark
            src="/brand/beamseree.svg"
            alt="@beamseree"
            width={223}
            height={37}
            className="w-[200px] min-w-0"
          />
        </header>

        <div className="py-5">
          <VendingSky />
        </div>

        <div className="flex flex-col gap-[1lh]">
          <p>
            I was born in Bangkok, studied in Boston, and now back living in
            Bangkok.
          </p>
          <p>
            I currently work at{" "}
            <TextLink href="https://automotionworks.com">
              Auto Motion Works
            </TextLink>
            , an automated warehouse manufacturer and integrator.
          </p>
          <p>
            Previously, I founded <TextLink href="#">BEMO</TextLink>, a
            branding and web design agency that helped brands build an online
            presence. Before that, I interned at{" "}
            <TextLink href="https://bangkoklife.com/en">
              Bangkok Life Assurance
            </TextLink>{" "}
            as a UXUI designer and Thailand’s Ministry of Innovation as an
            engineer.
          </p>
          <p>
            I enjoy building and maintaining open source tools for interface
            excellence, such as cmdk, Agentation, Liveline, and Drawesome.
          </p>
          <p>
            You can find me on <TextLink href="https://x.com/beamseree">X</TextLink>{" "}
            and{" "}
            <TextLink href="https://instagram.com/beamseree">Instagram</TextLink>
            , or reach me via <TextLink href="#">email</TextLink>.
          </p>
        </div>

        <GitHubContributions username="beamseree" title="Contributions" className="pt-8 pb-5" />

        <footer className="flex items-center justify-between whitespace-nowrap text-muted">
          <p>Bangkok, Thailand</p>
          <div className="flex items-center gap-3">
            <LocalTime timeZone="Asia/Bangkok" />
            <ThemeToggle />
          </div>
        </footer>
      </div>
    </main>
  );
}
