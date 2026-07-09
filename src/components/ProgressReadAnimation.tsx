type ProgressReadAnimationVariant = {
  id: string;
  label: string;
  description: string;
};

type ProgressReadAnimationProps = {
  loop?: boolean;
  variantId?: string;
};

const sealPopVariant: ProgressReadAnimationVariant = {
  id: "seal-pop",
  label: "Seal Pop",
  description: "A quick seal bloom with a confident check stroke.",
};

export const progressReadAnimationVariants: ProgressReadAnimationVariant[] = [
  sealPopVariant,
  {
    id: "orbit-tick",
    label: "Orbit Tick",
    description: "A partial orbit resolves into a compact check.",
  },
  {
    id: "quiet-stamp",
    label: "Quiet Stamp",
    description: "A restrained stamp motion with a soft settling ring.",
  },
  {
    id: "cloud-confirm",
    label: "Cloud Confirm",
    description: "A tiny cloud holds the check before fading back.",
  },
  {
    id: "ink-flick",
    label: "Ink Flick",
    description: "A brisk ink-like check with minimal ornament.",
  },
  {
    id: "brass-pulse",
    label: "Brass Pulse",
    description: "A warm pulse expands behind the mark.",
  },
  {
    id: "page-turn",
    label: "Page Turn",
    description: "A folded page flash resolves into read state.",
  },
  {
    id: "ember-mark",
    label: "Ember Mark",
    description: "A heavier check with a quick ember glow.",
  },
  {
    id: "halo-settle",
    label: "Halo Settle",
    description: "A halo traces first, then the check lands.",
  },
  {
    id: "plain-done",
    label: "Plain Done",
    description: "The most functional version, no flourish tax.",
  },
];

export function ProgressReadAnimation({
  loop = false,
  variantId = "seal-pop",
}: ProgressReadAnimationProps) {
  const variant =
    progressReadAnimationVariants.find((item) => item.id === variantId) ??
    sealPopVariant;

  return (
    <span
      className="progress-read-animation"
      data-read-animation={variant.id}
      data-loop={loop ? "true" : "false"}
      aria-hidden="true"
    >
      <svg
        className="progress-read-mark"
        focusable="false"
        viewBox="0 0 64 64"
      >
        <circle className="progress-read-halo" cx="32" cy="32" r="25" />
        <path
          className="progress-read-cloud"
          d="M17.5 41.2c-5.4 0-9.7-3.8-9.7-8.6 0-4.3 3.5-7.9 8.1-8.4C17.7 17.6 23.7 13.4 30.8 13.4c6.3 0 11.7 3.1 14.1 8.3 6.5.3 11.5 4.7 11.5 10.3 0 5.2-4.5 9.2-10.4 9.2H17.5Z"
        />
        <path className="progress-read-page" d="M19 15h19l7 7v27H19V15Z" />
        <path className="progress-read-page-fold" d="M38 15v8h7" />
        <path className="progress-read-check" d="M21.5 33.4 29 40.8 43.5 23.6" />
      </svg>
    </span>
  );
}
