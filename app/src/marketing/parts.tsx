// Shared building blocks for the public site: reveal-on-enter, cropped real screenshots in frames, pins, CTA band.
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ArrowRight, Info } from 'lucide-react'
import { ease } from '../lib/motion'

/** Sets the document title and description for a page. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    meta.content = description
  }, [title, description])
}

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 1.4v11.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** Fades and lifts content once, the first time it enters the viewport. Reduced motion: opacity only (MotionConfig). */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div', style }: {
  children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section'; style?: CSSProperties
}) {
  const C = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div
  return (
    <C
      className={className} style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.42, ease: ease.emphasized, delay }}
    >{children}</C>
  )
}

/** Scroll-linked drift for product frames. Returns 0 (no transform) when the visitor prefers reduced motion. */
export function useDrift(ref: RefObject<HTMLElement | null>, distance: number): MotionValue<number> | number {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance])
  return reduce ? 0 : y
}

export type Crop = { x: number; y: number; w: number; h: number }
const FULL: Crop = { x: 0, y: 0, w: 1440, h: 900 }
const SRC_W = 1440

function cropVars(c: Crop, suffix = '') {
  return {
    [`--ar${suffix}`]: `${c.w} / ${c.h}`,
    [`--iw${suffix}`]: `${(SRC_W / c.w) * 100}%`,
    [`--il${suffix}`]: `${(-c.x / c.w) * 100}%`,
    [`--it${suffix}`]: `${(-c.y / c.h) * 100}%`,
  } as CSSProperties
}

/**
 * A real product screenshot (1440×900 source), optionally cropped to a region in source pixels.
 * `mobileCrop` swaps to a tighter region under 760px so small screens see a legible detail rather than a thumbnail.
 */
export function Shot({ name, alt, crop = FULL, mobileCrop, priority, display = 1100 }: {
  name: string; alt: string; crop?: Crop; mobileCrop?: Crop; priority?: boolean
  /** Approximate rendered width of the frame on desktop, in CSS px (for `sizes`). */
  display?: number
}) {
  const zoom = SRC_W / crop.w
  const mZoom = SRC_W / (mobileCrop ?? crop).w
  const sizes = `(max-width: 760px) ${Math.round(100 * mZoom)}vw, ${Math.round(display * zoom)}px`
  return (
    <div className="mk-shot" data-m={mobileCrop ? '' : undefined} style={{ ...cropVars(crop), ...(mobileCrop ? cropVars(mobileCrop, '-m') : {}) }}>
      <img
        src={`/marketing/${name}.webp`}
        srcSet={`/marketing/${name}-960.webp 960w, /marketing/${name}.webp 1440w`}
        sizes={sizes}
        width={1440} height={900}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </div>
  )
}

/** Quiet browser chrome around a screenshot. The title is a page label, never a URL (there is no public deployment). */
export function Frame({ title, children, float, className = '', style }: { title?: string; children: ReactNode; float?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <figure className={`mk-frame ${float ? 'float' : ''} ${className}`} style={{ margin: 0, ...style }}>
      <div className="mk-frame-bar" aria-hidden>
        <span className="dots"><i /><i /><i /></span>
        <span className="title">{title && <span>{title}</span>}</span>
        <span className="spacer" />
      </div>
      <div className="mk-frame-body">{children}</div>
    </figure>
  )
}

/** Numbered marker over a screenshot (decorative; the legend list carries the meaning). x/y are percentages. */
export function Pin({ n, x, y }: { n: number; x: number; y: number }) {
  return <span className="mk-pin" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden>{n}</span>
}

export function SampleNote({ children = 'Sample workspace — fictional data' }: { children?: ReactNode }) {
  return <p className="mk-sample"><Info size={13} aria-hidden />{children}</p>
}

export function Eyebrow({ n, children, plain }: { n?: string; children: ReactNode; plain?: boolean }) {
  return <p className={`mk-eyebrow ${plain ? 'plain' : ''}`}>{n && <b>{n}</b>}{children}</p>
}

export function TrialCTAs({ dark, note = true }: { dark?: boolean; note?: boolean }) {
  return (
    <>
      <div className="mk-ctas">
        <Link to="/sign-up" className={`mk-btn ${dark ? 'mk-btn-invert' : 'mk-btn-primary'}`}>
          Start free trial <ArrowRight size={16} className="mk-arrow" aria-hidden />
        </Link>
        <Link to="/contact" className={`mk-btn ${dark ? 'mk-btn-outline-dark' : 'mk-btn-secondary'}`}>Talk to sales</Link>
      </div>
      {note && <p className="mk-cta-note">14 days of Professional for up to 10 people. No card required.</p>}
    </>
  )
}

export function CtaBand({ title, body }: { title?: ReactNode; body?: ReactNode }) {
  return (
    <section className="mk-section" aria-labelledby="cta-title">
      <div className="mk-wrap">
        <Reveal className="mk-cta">
          <span className="mk-cta-mark"><LogoMark size={22} /></span>
          <h2 id="cta-title" className="mk-h2">{title ?? <>Know who matters, what was promised, and <em>what happens next.</em></>}</h2>
          <p>{body ?? 'Set up a workspace in minutes with an industry template, invite your team, and bring your next meeting’s notes.'}</p>
          <TrialCTAs dark />
        </Reveal>
      </div>
    </section>
  )
}

/** Inner-page hero: eyebrow, h1, lede, optional actions. */
export function PageHero({ eyebrow, title, lede, children }: { eyebrow: string; title: ReactNode; lede: ReactNode; children?: ReactNode }) {
  return (
    <header className="mk-phero">
      <div className="mk-hero-grid" aria-hidden />
      <div className="mk-wrap">
        <motion.div className="mk-phero-in" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: ease.emphasized }}>
          <Eyebrow plain>{eyebrow}</Eyebrow>
          <h1 className="mk-h1">{title}</h1>
          <p className="mk-lede">{lede}</p>
          {children}
        </motion.div>
      </div>
    </header>
  )
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="mk-link">{children} <ArrowRight size={15} aria-hidden /></Link>
}

/** Ref helper typed for scroll targets. */
export const useEl = <T extends HTMLElement>() => useRef<T>(null)
