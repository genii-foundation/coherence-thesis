const astrologyIcons = {
  Jupiter: { symbol: "♃", className: "jupiter" },
  Mars: { symbol: "♂", className: "mars" },
  Mercury: { symbol: "☿", className: "mercury" },
  Moon: { symbol: "☽", className: "moon" },
  Neptune: { symbol: "♆", className: "neptune" },
  Saturn: { symbol: "♄", className: "saturn" },
  Sun: { symbol: "☉", className: "sun" },
  Uranus: { symbol: "♅", className: "uranus" },
  Venus: { symbol: "♀", className: "venus" },
} as const;

type AstrologyPlanet = keyof typeof astrologyIcons;

type AstrologyIconProps = {
  planet: string;
  className?: string;
  size?: "default" | "compact";
};

function isAstrologyPlanet(planet: string): planet is AstrologyPlanet {
  return planet in astrologyIcons;
}

export function AstrologyIcon({
  planet,
  className,
  size = "default",
}: AstrologyIconProps) {
  if (!isAstrologyPlanet(planet)) {
    return null;
  }

  const icon = astrologyIcons[planet];
  const classNames = [
    "astrology-icon",
    `astrology-icon-${icon.className}`,
    `astrology-icon-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} aria-label={planet} title={planet}>
      <span aria-hidden="true">{icon.symbol}</span>
    </span>
  );
}
