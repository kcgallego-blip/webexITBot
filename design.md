---
name: Crystal Finance System
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c4c6d1'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8e909b'
  outline-variant: '#444650'
  surface-tint: '#afc6ff'
  primary: '#afc6ff'
  on-primary: '#082e68'
  primary-container: '#34518d'
  on-primary-container: '#afc6ff'
  inverse-primary: '#415d9a'
  secondary: '#afc6ff'
  on-secondary: '#002d6c'
  secondary-container: '#134490'
  on-secondary-container: '#93b4ff'
  tertiary: '#c6c6c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#515353'
  on-tertiary-container: '#c6c7c7'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#afc6ff'
  on-primary-fixed: '#001944'
  on-primary-fixed-variant: '#274580'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#afc6ff'
  on-secondary-fixed: '#001a43'
  on-secondary-fixed-variant: '#134490'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2.5rem
  xl: 4rem
  gutter: 24px
  margin-mobile: 16px
  max-width: 1440px
---

## Brand & Style

This design system is built for elite financial and corporate environments where precision meets modern transparency. It utilizes a **Glassmorphism** aesthetic to convey a sense of depth, clarity, and "digital-first" sophistication. By layering translucent surfaces over vibrant brand accents, the UI feels lightweight yet structurally sound.

The mood is intentionally **premium and trustworthy**. It moves away from the heavy, opaque "bank-blue" layouts of the past, favoring a high-tech atmosphere that suggests innovation without sacrificing the gravitas required for institutional finance. The interaction between soft background blurs and sharp typography ensures that data remains the hero while being housed in a beautiful, ethereal shell.

## Colors

The palette is anchored by the **Masterpiece Group Blue (#34518d)**, a shade that provides instant institutional credibility. To achieve the glassmorphism effect, the system defaults to a **Dark Mode** foundation using a deep navy neutral (#0F172A) as the base canvas.

*   **Primary Blue:** Used for structural elements and high-priority branding.
*   **Vibrant Accent:** A brighter, illuminated version of the brand blue used for calls-to-action and active states to ensure they "pop" against frosted surfaces.
*   **Glass Layers:** Semi-transparent white values with varying opacities (4% to 10%) create the frosted effect.
*   **Semantic Colors:** Success (Emerald), Warning (Amber), and Error (Crimson) are used sparingly with high saturation to remain legible through translucent overlays.

## Typography

This design system uses a pairing of **Hanken Grotesk** for headings and **Inter** for body and UI labels. This combination balances the sharp, geometric precision of a modern tech brand with the legendary readability of a systematic sans-serif.

Headlines should utilize slightly tighter letter-spacing to feel "locked in" and professional. Labels and captions use a slightly increased letter-spacing and medium weight to ensure they remain legible when placed over semi-transparent, blurred backgrounds. Large display numbers (e.g., for financial balances) should always use Hanken Grotesk for maximum impact.

## Layout & Spacing

The system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile. Because glass surfaces can visually "bleed" into one another, we use generous spacing (24px gutters) to ensure distinct separation between content blocks.

Layouts should prioritize vertical rhythm using a 4px baseline. On desktop, content is typically contained within a 1440px max-width wrapper, centered on the screen to maintain a premium, balanced feel. For data-dense financial dashboards, margins can be reduced to `sm` (1rem) to maximize information density, provided the glass cards remain visually distinct.

## Elevation & Depth

Hierarchy is established through **optical depth** rather than simple flat color shifts. This is achieved using three core pillars:

1.  **Backdrop Blur:** All primary surfaces use `backdrop-filter: blur(12px)`. The more important the element (e.g., a modal), the higher the blur value (up to 24px).
2.  **Glass Borders:** Every card and container must have a 1px solid border. Use a top-to-bottom linear gradient (from `white 20%` to `white 5%`) to simulate a "light catch" on the top edge.
3.  **Shadow Character:** Shadows are extremely soft and diffused. Use a deep navy tint (`rgba(0, 0, 0, 0.4)`) with large blur radii (30px+) and no spread, making the cards appear as if they are floating gently above the background.

Backgrounds should feature subtle, large-scale gradients of the Brand Blue to provide the colors that will be refracted through the glass surfaces.

## Shapes

The design system uses a **Rounded (2)** shape language. The 0.5rem (8px) base radius provides a friendly, modern feel that softens the "coldness" of a tech-heavy corporate platform. 

Large containers like main dashboard cards should use `rounded-xl` (1.5rem) to emphasize the "object-like" quality of the glass. Buttons and input fields stay consistent at the base 0.5rem radius. This consistency in rounding helps unify the various translucent layers into a cohesive visual language.

## Components

### Buttons
Primary buttons use a solid gradient of the brand blue to the vibrant accent blue. Secondary buttons are "Ghost Glass" — transparent with a white border and a subtle hover blur increase.

### Frosted Glass Cards
The core container. Must include the 1px gradient border and `backdrop-filter`. Content inside should have ample padding (24px) to avoid touching the "refracted" edges of the card.

### Input Fields
Inputs are semi-transparent with a darker background than the card they sit on. Upon focus, the border glows with the vibrant accent blue, and the background opacity increases slightly to 10%.

### Navigation Bars
The top navigation is a fixed glass bar that spans the width of the screen. It uses a higher blur value (`20px`) to ensure text content scrolling underneath doesn't interfere with the legibility of navigation items.

### Vibrant Accents
Use the accent blue for progress bars, data visualization lines, and status indicators. These should be the only "solid" non-transparent elements in the UI to guide the user's eye to key information.