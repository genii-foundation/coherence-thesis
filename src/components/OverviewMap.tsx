import Image from "next/image";
import Link from "next/link";
import { catalog, sectionById, toProgressSection } from "@/lib/manuscript-data";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";

function coverVolumeForNode(
  node: (typeof catalog.overview.nodes)[number],
  index: number,
) {
  for (const reference of node.references) {
    const section = sectionById(reference.sectionId);
    const volume = section
      ? catalog.volumes.find(
          (candidate) => candidate.volumeId === section.volumeId,
        )
      : undefined;
    if (volume) return volume;
  }

  return catalog.volumes[index];
}

export function OverviewMap() {
  return (
    <section className="overview-map" aria-label="Five minute overview">
      {catalog.overview.nodes.map((node, index) => {
        const nodeSections = node.references.flatMap((reference) => {
          const section = sectionById(reference.sectionId);
          return section ? [toProgressSection(section)] : [];
        });
        const coverVolume = coverVolumeForNode(node, index);
        const numberLabel = coverVolume?.numberLabel ?? String(index + 1);

        return (
          <article key={node.id} className="overview-node">
            <div className="overview-node-heading">
              <span className="overview-node-number">{numberLabel}</span>
              <strong>{node.title}</strong>
              <span className="overview-node-status">
                <ReadCheckmarkIsland sections={nodeSections} />
              </span>
            </div>
            <div className="overview-node-body">
              <span
                className="overview-node-cover overview-node-cover-open"
                aria-hidden="true"
              >
                {coverVolume ? (
                  <Image
                    src={coverVolume.coverImage}
                    alt=""
                    width={192}
                    height={288}
                    sizes="(max-width: 720px) 4.5rem, 8rem"
                  />
                ) : null}
              </span>
              <div className="overview-node-content">
                <p>{node.summary}</p>
                <div className="reference-grid">
                  {node.references.map((reference) => {
                    const section = sectionById(reference.sectionId);
                    if (!section) return null;
                    return (
                      <Link key={reference.sectionId} href={section.href}>
                        <span>{reference.label ?? section.title}</span>
                        <ReadCheckmarkIsland
                          sections={[toProgressSection(section)]}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
