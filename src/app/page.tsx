import Image from "next/image";
import { LocalTime } from "@/components/site/local-time";
import { VendingSky } from "@/components/site/vending-sky";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center overflow-x-clip px-4 pt-20 pb-20">
      <div className="flex w-full max-w-[550px] flex-col gap-4 text-body text-ink">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 whitespace-nowrap leading-[normal]">
            <h1>Beam Sereeyothin</h1>
            <p className="text-muted">Engineer &amp; Designer</p>
          </div>
          <Image
            src="/brand/beamseree.svg"
            alt="@beamseree"
            width={223}
            height={37}
            preload
            className="h-auto w-[222.986px] min-w-0"
          />
        </header>

        <div className="py-5">
          <VendingSky />
        </div>

        <div className="flex flex-col gap-[1lh]">
          <p>I was born in London and now live in Los Angeles.</p>
          <p>I currently work at SpaceX as Head of Design for X and SpaceXSI.</p>
          <p>
            Previously, I led design at Base, a division of Coinbase. Before
            that, I founded Los Feliz Engineering, a consumer software company
            that created Honk, a real-time messaging app, and Family, a
            self-custody crypto wallet. LFE was acquired by Aave Labs, where I
            served as CPO.
          </p>
          <p>
            I enjoy building and maintaining open source tools for interface
            excellence, such as cmdk, Agentation, Liveline, and Drawesome.
          </p>
          <p>You can find me on X and Instagram, or reach me via email.</p>
        </div>

        <div className="py-5">
          <div className="flex items-center justify-center rounded-lg bg-surface px-4 py-[50px]">
            <Image
              src="/brand/website-coming-soon.svg"
              alt="Website coming soon"
              width={195}
              height={21}
              className="h-auto w-[194.887px] max-w-full"
            />
          </div>
        </div>

        <footer className="flex items-center justify-between whitespace-nowrap text-muted">
          <p>Bangkok, Thailand</p>
          <LocalTime timeZone="Asia/Bangkok" />
        </footer>
      </div>
    </main>
  );
}
