// Static stand-in for the click-to-play poster on the two marketing demo
// players (HeroDemoPlayer, ProDemoPlayer). Each player is a ~2,700-line client
// component carrying its own audio-synth and choreography engine, so the
// marketing pages pull them in with next/dynamic and paint this while the
// chunk arrives.
//
// It renders the SAME markup and the SAME CSS-module classes as the real
// poster inside each player, so the swap is invisible: .box owns the 16/9
// aspect ratio, so the box is the right size on the very first paint and
// nothing shifts. The only difference is that this button has no click
// handler, which is only true for the few hundred milliseconds before the
// real player mounts in its place.
//
// The player's own poster markup lives at the bottom of each player's JSX
// (search for styles.posterOverlay). Keep the two in sync.

type DemoPosterProps = {
  /** The player's own CSS module, so class hashes match its poster exactly. */
  styles: Readonly<Record<string, string>>;
  label: string;
  sub: string;
  duration: string;
  ariaLabel: string;
};

export default function DemoPoster({ styles, label, sub, duration, ariaLabel }: DemoPosterProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.box}>
        <button type="button" className={styles.posterOverlay} aria-label={ariaLabel}>
          <span className={styles.posterBg} aria-hidden="true"></span>
          <span className={styles.playCircle} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.5v11l9-5.5-9-5.5z" /></svg>
          </span>
          <span className={styles.posterLabel}>{label}</span>
          <span className={styles.posterSub}>{sub}</span>
          <span className={styles.durationBadge}>{duration}</span>
        </button>
      </div>
    </div>
  );
}
