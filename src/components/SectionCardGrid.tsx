import Link from "next/link";
import { BookmarkMarkerIsland } from "@/components/BookmarkMarkerIsland";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  toProgressSection,
  type Section,
} from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export function SectionCardGrid({ sections }: { sections: Section[] }) {
  return (
    <div className="chapter-list">
      {sections.map((section, index) => {
        const progressSection = toProgressSection(section);

        return (
          <Link
            key={section.sectionId}
            href={section.readerHref}
            className="chapter-card"
          >
            <span className="card-kicker">
              {String(index + 1).padStart(2, "0")}
              <span className="content-status-row">
                <BookmarkMarkerIsland sections={[progressSection]} />
                <UpdatedMarkerIsland sections={[progressSection]} />
                <ReadCheckmarkIsland sections={[progressSection]} />
              </span>
            </span>
            <strong>{section.title}</strong>
            <small>{formatReadingDurationForWords(section.wordCount)}</small>
          </Link>
        );
      })}
    </div>
  );
}
