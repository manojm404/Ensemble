FILE: design.md

# Aether Landing Page: Hero Section UI Design & Aesthetics

## 1. Core Aesthetic
Aligning with Aether's premium, eco-conscious, and minimalist brand identity, the hero section is designed to evoke a sense of calm, purity, and intentionality. The aesthetic balances high-end modernism with organic, grounding elements, visually communicating "holistic wellness" and a "lifetime investment."

## 2. Nature-Inspired Color Palette
The color scheme avoids harsh, synthetic tones, drawing entirely from natural landscapes to reinforce the brand's eco-friendly mission.

*   **Primary (Pine/Forest):** `#2C4C3B` — A deep, grounding green used for high-contrast elements and primary Call-To-Action (CTA) buttons.
*   **Secondary (Sage Mist):** `#8AA693` — A soft, muted green for hover states, accents, and secondary UI elements.
*   **Base/Neutral (Sandstone):** `#F4F1ED` — A warm, off-white with earthy undertones. Used for text areas or alternate backgrounds to avoid the clinical feel of stark white.
*   **Text & Accents (Riverstone):** `#2F302D` — A deep charcoal for typography, ensuring high readability and a softer, more natural contrast than pure black.

## 3. Typography
The font selection bridges the gap between "premium elegance" and "modern minimalism."

*   **Display & Headings:** *Lora* (Serif) or *Playfair Display*. Used for the main hero headline. The organic, fluid curves of the serif evoke the movement of water and add an editorial, high-end feel.
*   **Body, UI & Navigation:** *Inter* or *Montserrat* (Sans-Serif). Clean, highly legible, and unpretentious for sub-copy, navigation links, and button text.

## 4. Grid Layout & Structure
The hero section utilizes a standard responsive **12-column CSS Grid** spanning the full viewport height (`100vh`).

*   **Global Layout:** Split composition to balance text and imagery.
*   **Navigation Header (Row 1, Cols 1-12):** Transparent background. Logo aligned to the far left (Cols 1-2). Minimalist navigation links (e.g., Shop, Our Mission, Journal) and cart icon aligned to the right (Cols 9-12).
*   **Hero Content Block (Row 2, Cols 2-6):** Left-aligned to allow the background scenery to dominate the right side of the screen.
    *   *Eyebrow Text:* Small, spaced out sans-serif (e.g., "SUSTAINABLE HYDRATION").
    *   *Headline:* Large serif spanning 4-5 lines.
    *   *Sub-copy:* Sans-serif paragraph detailing the product's premium build and environmental impact.
    *   *CTA Group:* Primary Button (Solid Pine: "Shop the Collection") and Secondary Button (Outline/Hollow: "Explore the Mission") placed side-by-side.
*   **Negative Space (Row 2, Cols 7-12):** Unobstructed layout space to frame the product and the majestic background.

## 5. Background Image Specification
*   **Subject:** A high-resolution, sweeping wide shot of a misty mountain range at dawn, gently reflecting off the surface of a perfectly calm, glassy alpine lake. The lighting should be soft, cool, and optimistic (early morning light).
*   **Treatment & Overlay:** The image will cover the entire background (`background-size: cover`). To guarantee text legibility on the left-hand columns, a subtle gradient overlay (from `#2F302D` at 60% opacity on the far left, fading to 0% opacity towards the center) will be applied.