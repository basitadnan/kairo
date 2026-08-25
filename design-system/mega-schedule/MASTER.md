# MEGA Schedule — Design System (MASTER)

Direction: **Soft Editorial**. Calm, warm, premium; explicitly anti-AI-slop.
Derived from the `minimalist-ui`, `high-end-visual-design`, `ui-ux-pro-max` and
`design-taste-frontend` skills. Tokens live in `src/styles/globals.css` and must not
be hardcoded in components.

> When building a specific page, check `design-system/mega-schedule/pages/[page-name].md`
> for overrides; otherwise follow this file.

## Palette

| Role | Light | Dark |
|---|---|---|
| Canvas | `#F7F6F3` | `#131311` |
| Surface | `#FFFFFF` | `#1B1A17` |
| Surface 2 | `#FAF9F6` | `#211F1B` |
| Hairline | `#E9E7E2` | `#2C2B26` |
| Hairline strong | `#DCD9D1` | `#39372F` |
| Ink (never pure black) | `#2A2A28` | `#ECEAE3` |
| Ink secondary | `#7A7874` | `#9B9890` |
| Ink faint | `#A5A29B` | `#6E6B63` |
| Accent (muted sage) | `#57653F` | `#B3C79A` |
| Accent soft bg | `#EBF0E3` | sage @ 14% alpha |
| Button (charcoal) | `#26251F` / text `#FBFAF7` | `#ECEAE3` / text `#1B1A17` |

Category pastels (bg / text), light → dark equivalents in tokens:
red `#FDEBEC/#9F2F2D` · blue `#E1F3FE/#1F6C9F` · green `#EDF3EC/#346538` ·
yellow `#FBF3DB/#8A5C00` · lavender `#EFEBFA/#65558F` · teal `#E3F4F1/#1E655C`.

## Typography

- UI: **Plus Jakarta Sans Variable** (`font-sans`)
- Times, dates, countdowns, meta: **JetBrains Mono Variable**, tabular nums via `.tnum` (`font-mono`)
- Greetings / one editorial flourish per screen: **Newsreader Variable** (`font-serif`)
- Inter/Roboto banned. Serif never used for body or controls.

## Components

- Cards: radius 14px, 1px hairline border, ultra-diffused warm shadow (< 0.07 alpha). No heavy drop shadows.
- Buttons: solid charcoal (primary) or hairline soft; radius 10px; press feedback scale(0.98).
- Chips/tags: uppercase pills, 10.5px semibold, tracking 0.07em, pastel bg + deep tone text.
- Inputs: label ABOVE, helper/error BELOW; radius 10px; focus ring = accent outline.
- Icons: Phosphor only, regular weight, consistent sizing (17px nav, 19px tabs, 14px inline).
- Emojis as icons are banned.

## Motion

- Library: `motion/react`. Entries: fade + y(12→0), 350–450ms, `cubic-bezier(0.16,1,0.3,1)`; list stagger ~60ms.
- Animate transform/opacity only; honor `prefers-reduced-motion`; no scroll listeners.

## App UX rules

- Mobile (< lg): sticky top bar + fixed bottom tab bar (5 slots, ≥48dp targets, safe-area insets).
- Desktop (≥ lg): 228px sidebar with primary + footer groups; sync status + theme segmented control at bottom.
- Every screen provides loading skeletons, composed empty states and inline errors.
- Contrast: WCAG AA in both themes; test both before shipping.
