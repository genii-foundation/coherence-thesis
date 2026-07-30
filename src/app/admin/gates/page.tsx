import styles from "../admin.module.css";
import { readGlyphViolations, readProtectedLineViolations, readRules } from "../adminData";

export const dynamic = "force-dynamic";

export default function GatesPage() {
  const { checked, violations } = readProtectedLineViolations();
  const glyphs = readGlyphViolations();
  const rules = readRules();

  return (
    <>
      <h1 className={styles.h1}>Gates</h1>
      <p className={styles.sub}>
        Editorial obligations that a machine can check. Anything red here is a claim the repository
        makes about itself that is currently false.
      </p>

      <p className={styles.micro}>Protected lines</p>
      <div className={styles.card} style={{ marginBottom: 24 }}>
        <p>
          A voice card names its protected passages in exact quotation, which makes the strongest
          section of the card mechanically checkable.{" "}
          <span className={violations.length ? styles.bad : styles.ok}>
            {checked - violations.length} of {checked} present.
          </span>
        </p>
        {violations.length ? (
          <div className={styles.sections}>
            {violations.map((v) => (
              <div className={styles.section} key={`${v.editorialId}-${v.line}`}>
                <span className={styles.id}>{v.editorialId.replace("volume-", "")}</span>
                <span className={styles.bad}>✗</span>
                <span>&ldquo;{v.line}&rdquo;</span>
                <span />
              </div>
            ))}
          </div>
        ) : null}
        <p className={styles.detail}>
          Run locally with <span className={styles.cmd}>npm run editorial:protected-lines</span>.
          Not yet wired into <span className={styles.cmd}>npm run validate</span>, because it would
          block every run while these remain missing.
        </p>
      </div>

      <p className={styles.micro}>Prohibited glyphs</p>
      <div className={styles.card} style={{ marginBottom: 24 }}>
        <p>
          The punctuation standard prohibits the em dash, the en dash, and the double hyphen
          throughout published prose. A single paste can make that claim false, and nothing
          in the reader shows it.{" "}
          <span className={glyphs.violations.length ? styles.bad : styles.ok}>
            {glyphs.violations.length
              ? `${glyphs.violations.length} in ${glyphs.checked} manuscripts.`
              : `Clean across ${glyphs.checked} manuscripts.`}
          </span>
        </p>
        {glyphs.violations.length ? (
          <div className={styles.sections}>
            {glyphs.violations.slice(0, 20).map((v) => (
              <div className={styles.section} key={`${v.editorialId}-${v.line}-${v.glyph}`}>
                <span className={styles.id}>
                  {v.editorialId.replace("volume-", "")}:{v.line}
                </span>
                <span className={styles.bad}>{v.glyph}</span>
                <span className={styles.detail}>{v.excerpt}</span>
                <span />
              </div>
            ))}
          </div>
        ) : null}
        <p className={styles.detail}>
          Enforced by <span className={styles.cmd}>npm run editorial:lint</span>.
        </p>
      </div>

      <p className={styles.detail}>
        The named obligations in the editorial standard are not gates. Most of them need
        judgment about a passage, which no check can supply. What can be measured is whether
        each one is actually being used, and that lives on{" "}
        <a href="/admin/calibration/">Calibration</a> as rule usage: {rules.length} rules, each
        with the count of findings that cite it. A rule at zero is either dead or unenforced.
      </p>
    </>
  );
}
