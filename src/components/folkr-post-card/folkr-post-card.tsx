import { Component, Prop, State, Event, EventEmitter, h, Host } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost } from '@folkr/shared';
import {
  formatDistance, formatWhen, formatRange, formatDailyRun, formatWeekly, untilOf,
  requiresLicence, isSaved, toggleSave, imageFor,
} from '@folkr/shared';

/**
 * One post in the feed. Renders all three shapes from a single component,
 * because the feed is one stream — splitting into tabs makes a thin feed
 * look dead.
 *
 * Image-led: the picture is the card, and the text is its caption. The
 * description is deliberately absent — it belongs in the detail view. Two
 * lines of prose per card is what turned thirty events into fifteen screens
 * of scrolling, and it is not what anyone reads when deciding whether to tap.
 *
 * Every post has an image, always: a real photo when someone uploaded one, a
 * drawn cover otherwise. See imageFor() — an image-led card with a hole in it
 * is worse than the text card it replaced.
 */
@Component({
  tag: 'folkr-post-card',
  styleUrl: 'folkr-post-card.css',
  shadow: true,
})
export class LePostCard {
  @Prop() post!: Post;
  @Prop() distanceKm = 0;

  /**
   * Row layout instead of a full card.
   *
   * A mode rather than a separate component, so saving and opening behave
   * identically in both densities. Two components would drift, and the bug
   * would be "save works in the list but not the grid".
   */
  @Prop() compact = false;

  @State() saved = false;

  /** Briefly, after the link has gone to the clipboard. */
  @State() shared = false;

  /**
   * Carries the whole post, not just an id.
   *
   * The shell has no post lookup and shouldn't need one — posts live in the
   * fragment that queried for them, and a post written on this device isn't in
   * the seed data at all, so an id would be unresolvable. The card already
   * holds everything the detail view needs.
   */
  @Event({ eventName: 'folkr:open-post', bubbles: true, composed: true })
  openPost!: EventEmitter<{ post: Post; distanceKm: number }>;

  @Event({ eventName: 'folkr:toggle-save', bubbles: true, composed: true })
  toggleSaved!: EventEmitter<{ id: string; saved: boolean }>;

  componentWillLoad() {
    this.saved = isSaved(this.post.id);
  }

  private open = () => {
    this.openPost.emit({ post: this.post, distanceKm: this.distanceKm });
  };

  private onSave = (e: MouseEvent) => {
    // The card is itself a button; without this, saving also opens the post.
    e.stopPropagation();
    // Trust what persisted, not what we asked for — a save can fail on quota.
    this.saved = toggleSave(this.post.id);
    this.toggleSaved.emit({ id: this.post.id, saved: this.saved });
  };

  /**
   * Hand the post's link to whatever the device uses for sharing.
   *
   * The share sheet where there is one — that is the whole point on a phone,
   * because it puts the post one tap from a WhatsApp thread or a group chat.
   * The clipboard where there is not, which is every desktop browser.
   *
   * The link is absolute and built from the page's own origin, not from a
   * constant: it has to survive being pasted somewhere else, and hardcoding a
   * host means every link sent from localhost points at localhost.
   */
  private onShare = async (e: MouseEvent) => {
    // The card is itself a button; without this, sharing also opens the post.
    e.stopPropagation();

    const url = `${location.origin}${location.pathname}#/post?id=${encodeURIComponent(this.post.id)}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: this.post.title, url });
        return;
      } catch {
        /* Dismissing the share sheet rejects, and so does a browser that
           advertises the API but refuses the payload. Neither is an error
           worth showing — fall through to the clipboard. */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      this.shared = true;
      setTimeout(() => (this.shared = false), 1800);
    } catch {
      // Clipboard access can be refused outright. Say nothing rather than
      // claiming a copy that did not happen.
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.open();
    }
  };

  private kindBadge() {
    const p = this.post;
    if (p.kind === 'event') {
      return p.author.kind === 'business'
        ? <folkr-badge tone="biz" label="Venue" />
        : <folkr-badge tone="com" label="Community" />;
    }
    if (p.kind === 'request') {
      const t = (p as RequestPost).serviceType;
      return <folkr-badge tone="com" label={t === 'petcare' ? 'Pet care' : 'Help needed'} />;
    }
    return <folkr-badge tone="biz" label="Service" />;
  }

  private trustBadges() {
    const p = this.post;
    const out = [];

    if (p.author.kind === 'business' && p.author.verified) {
      out.push(<folkr-badge tone="good" glyph="✓" label="Verified" />);
    }

    if (p.kind === 'offer') {
      const o = p as OfferPost;
      if (requiresLicence(o.trades)) {
        out.push(
          o.licence?.verified
            ? <folkr-badge tone="good" glyph="✓" label={`Licence ${o.licence.state}`} />
            : <folkr-badge tone="warn" glyph="!" label="Licence unverified" />,
        );
      }
    }

    if (p.kind === 'request' && (p as RequestPost).requiresHomeAccess) {
      out.push(<folkr-badge tone="warn" glyph="⌂" label="Home access" />);
    }

    return out;
  }

  /** The time line differs per kind — that's the whole point of the three shapes. */
  private whenLine(): string {
    const p = this.post;
    if (p.kind === 'event') {
      const e = p as EventPost;
      // A run with a last day is described by its hours and that last day.
      // Describing it by its first occurrence gives "ended · repeats" on a
      // sale that is still going, which is worse than saying nothing.
      const until = untilOf(e.rrule);
      if (until !== null) return formatDailyRun(e.startsAt, e.endsAt, until);
      // A weekly listing is described by the day it recurs on, not by the date
      // of one occurrence.
      const weekly = formatWeekly(e.rrule, e.startsAt);
      if (weekly) return weekly;
      return e.rrule ? `${formatWhen(e.startsAt)} · repeats` : formatWhen(e.startsAt);
    }
    if (p.kind === 'request') {
      const r = p as RequestPost;
      return formatRange(r.neededFrom, r.neededTo);
    }
    return (p as OfferPost).availability;
  }

  private priceLine(): string | null {
    const p = this.post;
    if (p.kind === 'request') {
      const r = p as RequestPost;
      return r.budget ? `Budget $${r.budget}` : null;
    }
    if (p.kind === 'offer') {
      const o = p as OfferPost;
      return o.rate ? `$${o.rate}/${o.rateUnit ?? 'job'}` : null;
    }
    const e = p as EventPost;
    if (e.price) return `$${e.price}`;
    return e.rsvpCount > 0 ? `${e.rsvpCount} going` : null;
  }

  /** The dense form: thumbnail, two lines, distance. Roughly a third the height. */
  private renderCompact() {
    const p = this.post;
    return (
      <article
        class={{ row: true, [`kind-${p.kind}`]: true }}
        tabindex="0"
        role="button"
        onClick={this.open}
        onKeyDown={this.onKey}
      >
        <img class="row-img" src={imageFor(p)} alt="" loading="lazy" decoding="async" />
        <span class="row-text">
          <span class="row-title">{p.title}</span>
          <span class="row-sub">{p.neighbourhood}</span>
        </span>
        <span class="row-right">
          <span class="row-when">{this.whenLine()}</span>
          <span class="row-dist">{formatDistance(this.distanceKm)}</span>
        </span>
      </article>
    );
  }

  render() {
    if (this.compact) return <Host class="is-compact">{this.renderCompact()}</Host>;
    const p = this.post;
    const claimed = p.kind === 'request' && (p as RequestPost).claimState === 'claimed';
    const price = this.priceLine();

    return (
      <Host>
        <article
          class={{ card: true, [`kind-${p.kind}`]: true, claimed }}
          tabindex="0"
          role="button"
          onClick={this.open}
          onKeyDown={this.onKey}
        >
          {/* A real photograph fills the card — that is what an image-led
              feed is for. A DRAWN cover is not a photograph, and stretching one
              to banner width crops its subject away and leaves a wide band of
              flat colour saying nothing.

              So when nobody uploaded a picture the card shows the same icon
              tile the compact rows use, at the same size. A small mark that
              tells you what the post is beats a large one that does not. */}
          <div class={{ cover: true, drawn: !p.imageUrl }}>
            <img src={imageFor(p)} alt="" loading="lazy" decoding="async" />

            {/* Over the image, not under it — the badges are what the picture
                is for, and putting them below costs a whole line of height. */}
            {/* Trust badges stay on the card. Verified business, an
                unverified licence, and home access are the things someone
                weighs BEFORE tapping — moving them into the detail would mean
                they only see the warning after they are already interested. */}
            <div class="badges">
              {this.kindBadge()}
              {this.trustBadges()}
              {claimed ? <folkr-badge tone="neutral" label="Claimed" /> : null}
            </div>
          </div>

          <div class="text">
            <div class="title-row">
              <h3 class="title">{p.title}</h3>
              <div class="acts">
                {/* On the title row, NOT over the cover.
                    They started as white icons floating on the photograph,
                    which worked right up until a post had no photograph: the
                    drawn cover is a pale gradient, and a white icon on it is
                    invisible — which is most of the feed. Ink on the card
                    surface reads on every card there is. */}
                <button
                  class={{ share: true, on: this.shared }}
                  type="button"
                  aria-label={this.shared ? 'Link copied' : 'Share this post'}
                  title={this.shared ? 'Link copied' : 'Share'}
                  onClick={this.onShare}
                >
                  {this.shared ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M5 12.5 10 17.5 19 7" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 15.5V3.5" />
                      <path d="M8 7.2 12 3.2l4 4" />
                      <path d="M5.5 12.5v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7" />
                    </svg>
                  )}
                </button>

                <button
                  class={{ save: true, on: this.saved }}
                  type="button"
                  aria-pressed={String(this.saved)}
                  aria-label={this.saved ? 'Saved — tap to remove' : 'Save this post'}
                  onClick={this.onSave}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6.5 3.5h11a1 1 0 0 1 1 1v15.2a.6.6 0 0 1-.94.5L12 16.4l-5.56 3.8a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1Z"
                      fill={this.saved ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <p class="meta">
              <span class="when">{this.whenLine()}</span>
              <span class="dot" aria-hidden="true">·</span>
              <span class="dist">{formatDistance(this.distanceKm)}</span>
            </p>
            <p class="foot">
              {price ? <span class="price">{price}</span> : null}
              <span class="who">
                {p.author.displayName}
                {/* Badges, not bare ticks. The word carries the claim — a lone
                    checkmark reads as decoration, and this is the one signal
                    someone weighs before letting a stranger into their home. */}
                <folkr-badges
                  idVerified={p.author.idVerified}
                  phoneVerified={p.author.phoneVerified === true}
                  size="sm"
                />
              </span>
            </p>
          </div>
        </article>
      </Host>
    );
  }
}
