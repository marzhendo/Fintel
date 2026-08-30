---
name: Fintel
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#6b38d4'
  on-secondary: '#ffffff'
  secondary-container: '#8455ef'
  on-secondary-container: '#fffbff'
  tertiary: '#0058be'
  on-tertiary: '#ffffff'
  tertiary-container: '#2170e4'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 32px
  gutter: 24px
  stack-sm: 12px
  stack-md: 20px
  stack-lg: 40px
---

## Brand & Style

The design system is built on the principle of "Financial Wellness through Empathy." It moves away from the cold, spreadsheet-driven aesthetics of traditional banking, instead prioritizing a high-end consumer experience that feels supportive and optimistic.

The style is **Modern Tactile**, blending Minimalism with subtle Neomorphic influences. It utilizes generous whitespace to reduce cognitive load and large, friendly radii to evoke a sense of safety and approachability. The UI should feel like a premium lifestyle app rather than a utility, focusing on soft transitions and breathable layouts that make complex data feel manageable.

## Colors

This design system uses a palette rooted in "Growth Emerald." 

- **Primary (Emerald):** Represents stability and growth. Used for main actions, positive trends, and primary branding.
- **AI Accent (Purple/Electric Blue):** A dual-tone gradient or solid used exclusively for AI-driven insights, chat interfaces, and automated suggestions to distinguish "machine" intelligence from user data.
- **Status (Traffic Light):** A strict semantic system for budget tracking. 
    - **Green:** Healthy (<80% of budget).
    - **Yellow:** Caution (80–100%).
    - **Red:** Over-limit (>100%).
- **Dark Mode:** Rather than pure black, the dark mode utilizes "Deep Forest" slate tones (#064E3B) to maintain the brand's green identity while ensuring high contrast for vibrant accents.

## Typography

The typography system pairs **Plus Jakarta Sans** for expressive headings with **Inter** for utilitarian body text. This creates a balance between a friendly, rounded personality and professional legibility.

- **Headlines:** Use Plus Jakarta Sans with tighter letter-spacing for a modern, "squishier" look that feels premium.
- **Body:** Use Inter for all financial data, lists, and long-form descriptions to ensure maximum readability.
- **Data Points:** Currency values should always use `label-md` or higher weight to emphasize the numbers, which are the core of the user experience.

## Layout & Spacing

The design system employs a **Fluid-Fixed Hybrid** layout. On desktop, the sidebar is fixed at 280px, while the main content area utilizes a fluid grid with a maximum content width of 1440px to prevent lines of text from becoming too long.

- **Whitespace:** Use "generous breathing room." Avoid crowding cards. Every major module should be separated by at least `stack-lg`.
- **Rhythm:** An 8px base unit drives all spacing.
- **Margins:** Desktop views should maintain a minimum 32px safe area from the window edges to prevent the UI from feeling "trapped" in the browser or app shell.

## Elevation & Depth

Hierarchy is established through **Ambient Depth**. We avoid harsh black shadows in favor of tinted, diffused shadows that reflect the background color.

- **Level 1 (Base):** The main application background.
- **Level 2 (Cards):** Soft, multi-layered shadows (Blur: 20px, Spread: -5px, Opacity: 8% of Primary Color).
- **Level 3 (Modals/Popovers):** Higher elevation with a subtle backdrop blur (12px) to keep the user focused on the foreground task.
- **AI Elements:** Utilize a subtle glow effect (inner shadow or outer bloom) using the secondary Purple accent to signify active intelligence.

## Shapes

The shape language is defined by **Extreme Radii**. While the base `roundedness` is set to 2 (0.5rem), this design system pushes container elements further to create its signature approachable look.

- **Standard Components:** Buttons and inputs use 12px (0.75rem).
- **Cards/Modules:** Use 24px (1.5rem) to 32px (2rem) for a "pillow-like" appearance.
- **Interactive States:** On hover, cards may subtly scale up (1.02x) rather than changing border color, maintaining the soft aesthetic.

## Components

- **Buttons:** Primary buttons are fully rounded (pill-style) using the Emerald color. Secondary buttons use a tonal background (10% opacity of primary).
- **Input Fields:** Large 56px height with 16px horizontal padding. Borderless with a light-grey or deep-emerald-tinted background and 1px "soft" focus rings.
- **Cards:** The primary container for financial data. Must include 24px internal padding. Backgrounds should be pure white (Light Mode) or Deep Emerald (Dark Mode).
- **Budget Trackers:** Linear progress bars with 12px height and fully rounded caps. The track background should be a low-contrast version of the status color.
- **AI Insights Chip:** A special component with a subtle gradient background (Purple to Blue) and a "sparkle" icon, used to highlight automated advice.
- **Lists:** Transaction lists should have no visible dividers. Use vertical spacing (12px) and subtle hover backgrounds to separate items.