import { Component, Element, Host, State, Prop, h } from '@stencil/core';

/**
 * Dummy sponsors. Nothing is fetched; these stand in for a real ad feed.
 *
 * Every name here is INVENTED, and has to stay that way. The seeded venues
 * were once real local businesses — a brewery, a market, a coffee shop — and
 * that was already indefensible when they were only demo posts. As
 * advertisers it would be worse: an ad asserts a commercial relationship, and
 * putting a real trading name in one claims a deal that does not exist.
 *
 * WHAT MAY NEVER APPEAR HERE: adult content, gambling, and anything else that
 * would be indefensible beside a post about a kids' craft session. This app
 * asks neighbours to trust strangers enough to let them into their houses; a
 * single ad of that kind spends more trust than the slot could earn back.
 *
 * With a real network this is not a code change — it is a settings one.
 * AdSense calls it Blocking controls, and the sensitive categories have to be
 * turned off deliberately; the default is permissive.
 */
/**
 * The ads in rotation.
 *
 * Every name here is INVENTED and has to stay that way. An ad asserts a
 * commercial relationship, so a real trading name in one claims a deal that
 * does not exist — the Victory Brewing problem again, with worse consequences
 * than it had in seed data.
 *
 * Both lines are short on purpose. The bar gives each one line and truncates
 * past it, and an ellipsis mid-word reads as text being cut off rather than as
 * a limit being respected. If a real advertiser's copy does not fit here, it
 * does not fit in the product.
 *
 * ALSO: nothing adult, nothing gambling, nothing that would be indefensible
 * beside a post about a kids' craft session. On a real network that is a
 * settings step, not a code one — AdSense calls it Blocking controls and
 * defaults to permissive.
 */
const SLOTS: ReadonlyArray<{ name: string; line: string }> = [
  { name: 'Marsh Lane Hardware', line: '20% off power tools · 0.9 mi' },
  { name: 'Kettle & Crumb', line: 'Free coffee before 8am · 1.2 mi' },
  { name: 'Pinebrook Auto', line: 'Oil change $39 · 2.4 mi' },
];



/**
 * A sponsored slot, shaped like a post card.
 *
 * Native rather than a banner: it earns attention because it is the shape
 * people came to read, and it costs little because it scrolls away like
 * everything else. The label is what keeps that honest — an ad shaped like
 * content and NOT marked as one is what makes people stop trusting an app,
 * and this one runs entirely on people trusting strangers.
 *
 * Lives here rather than in each fragment because it appears on every list
 * page. Five copies would be five things to keep in step, and the first time
 * they drifted somebody would see two ads on one screen.
 *
 * Deliberately NOT on a post's detail page. Somebody reading a neighbour's
 * request is deciding whether to let a stranger into their house, and an ad
 * on that screen spends trust that cannot be bought back.
 *
 * Placeholder: nothing is fetched, nothing is measured, no third party is
 * contacted. A real ad network could not render in here anyway — this is a
 * shadow root, and scripts like AdSense walk the light DOM and find nothing.
 */
@Component({
  tag: 'folkr-sponsored',
  styleUrl: 'folkr-sponsored.css',
  shadow: true,
})
export class LeSponsored {
  /** How long each sponsor holds the slot. */
  @Prop() rotateMs = 5000;

  /** How long a dismissal lasts before the slot returns. */
  @Prop() dismissMs = 5 * 60 * 1000;

  /* A TIMESTAMP, not a flag.
     A boolean can only say "closed", so it either lasted the session or
     forever — and neither is an ad product. Storing when it happened lets the
     slot come back on its own, and survives a reload in between. */
  private static readonly KEY = 'folkr.sponsored.dismissedAt';

  @State() index = 0;
  @State() gone = false;
  @State() paused = false;

  @Element() el!: HTMLElement;

  private timer?: number;
  private revive?: number;
  private ro?: ResizeObserver;

  /**
   * Tell the rest of the app how much room this is taking.
   *
   * A fixed banner lands in the one strip that already holds the tab bar and
   * the compose button, and neither of them can know it is there. Publishing
   * the height means the button can sit above it and the last list item is
   * not hidden behind it — the same contract the shell uses for the tab bar,
   * for the same reason.
   *
   * Zero when dismissed, so everything moves back down rather than leaving a
   * band of empty space where the banner used to be.
   */
  private publishHeight = () => {
    const h = this.gone ? 0 : Math.round(this.el.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--folkr-ad-h', `${h}px`);
  };

  /** Milliseconds remaining on a dismissal, or 0 if the slot should show. */
  private dismissedFor(): number {
    try {
      const at = Number(localStorage.getItem(LeSponsored.KEY) ?? 0);
      if (!at) return 0;
      return Math.max(0, at + this.dismissMs - Date.now());
    } catch {
      /* Private mode throws on access. An ad that cannot remember being
         dismissed is a smaller problem than a page that fails to render. */
      return 0;
    }
  }

  componentWillLoad() {
    /* localStorage, because a dismissal has to outlive the page: the slot is
       on five screens and closing it on one has to hold on the other four,
       across navigations that rebuild the component each time. */
    const left = this.dismissedFor();
    if (left > 0) {
      this.gone = true;
      // Back on its own, without needing a reload or a navigation.
      this.revive = window.setTimeout(() => {
        this.gone = false;
        this.start();
      }, left);
      return;
    }

    /* Somebody who has asked for less motion gets the first sponsor and no
       rotation. Content that changes itself on a timer is exactly what that
       setting is asking us not to do, and WCAG wants a way to stop anything
       that auto-updates — here, honouring the setting IS the way. */
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    this.start();
  }

  componentDidRender() {
    this.publishHeight();
  }

  componentDidLoad() {
    // The height changes with the user's font scale, and on rotation.
    this.ro = new ResizeObserver(this.publishHeight);
    this.ro.observe(this.el);
  }

  disconnectedCallback() {
    this.ro?.disconnect();
    /* Leaving the page takes the banner with it, so the space it claimed has
       to be given back — otherwise every screen keeps a gap for a banner that
       is not there. */
    document.documentElement.style.setProperty('--folkr-ad-h', '0px');
    this.stop();
    // Or a slot that was closed on a page you have left comes back on a page
    // that no longer exists.
    window.clearTimeout(this.revive);
  }

  private start() {
    this.stop();
    // Nothing to rotate through, and % 0 is NaN.
    if (SLOTS.length < 2) return;
    this.timer = window.setInterval(() => {
      if (!this.paused) this.index = (this.index + 1) % SLOTS.length;
    }, this.rotateMs);
  }

  private stop() {
    // Or navigating away mid-cycle leaves a timer ticking against a component
    // that no longer exists.
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private dismiss = () => {
    this.gone = true;
    this.stop();
    try {
      localStorage.setItem(LeSponsored.KEY, String(Date.now()));
    } catch {
      /* See above — it still closes for this page either way. */
    }
    this.revive = window.setTimeout(() => {
      this.gone = false;
      this.start();
    }, this.dismissMs);
  };

  /* Rotation stops while somebody is actually looking at it. A slot that
     changes out from under a pointer, or mid-read, is the thing that makes
     rotation feel like a slot machine rather than a listing. */
  private hold = () => (this.paused = true);
  private release = () => (this.paused = false);

  render() {
    // Nothing to show is not an empty bar — it is no bar at all.
    if (this.gone || SLOTS.length === 0) return null;
    const slot = SLOTS[this.index]!;

    return (
      <Host>
        <article
          class="slot"
          onMouseEnter={this.hold}
          onMouseLeave={this.release}
          onFocusin={this.hold}
          onFocusout={this.release}
        >
          {/* key, so each sponsor REPLACES the last rather than mutating it —
              which is what lets the fade run on every change. */}
          <div class="body">
            <span class="tag">Sponsored</span>
            <p class="title" key={`t${this.index}`}>{slot.name}</p>
            <p class="meta" key={`m${this.index}`}>{slot.line}</p>
          </div>

          <button class="x" type="button" aria-label="Close this ad" onClick={this.dismiss}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* Which of them you are on. Two dots is a small thing, but without
              it a panel that changes itself reads as the page glitching. */}
          <div class="dots" aria-hidden="true">
            {SLOTS.map((_, i) => (
              <span class={{ dot: true, on: i === this.index }}></span>
            ))}
          </div>
        </article>
      </Host>
    );
  }
}
