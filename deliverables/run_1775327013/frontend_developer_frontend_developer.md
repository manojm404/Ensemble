```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aether | Eco-Conscious Premium Essentials</title>
    
    <!-- Preload for LCP (Largest Contentful Paint) Optimization -->
    <link rel="preload" as="image" href="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000&auto=format&fit=crop">
    
    <!-- Google Fonts: Playfair Display (Serif) & Inter (Sans-Serif) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Playfair+Display:wght@400;600&display=swap" rel="stylesheet">
    
    <style>
        :root {
            /* Nature-inspired Color Palette */
            --primary-color: #2C4C3B; /* Deep Forest Green */
            --base-color: #F4F1ED;    /* Warm Off-White */
            --overlay-color: #2F302D; /* Dark Olive/Grey */
            
            /* Typography */
            --font-heading: 'Playfair Display', serif;
            --font-body: 'Inter', sans-serif;
        }

        /* Reset & Base Styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background-color: var(--base-color);
            font-family: var(--font-body);
            color: var(--base-color); /* Overridden inside the hero, but default to high contrast base */
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* Hero Layout - 12 Column CSS Grid */
        .hero {
            position: relative;
            width: 100%;
            min-height: 100vh;
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            align-items: center;
            
            /* High-res background image of a mountain range */
            background-image: url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000&auto=format&fit=crop');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }

        /* 60% Opacity Gradient Overlay for Text Legibility (WCAG 2.1 AA) */
        .hero::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(
                90deg, 
                rgba(47, 48, 45, 0.85) 0%, 
                rgba(47, 48, 45, 0.40) 100%
            );
            z-index: 1;
        }

        /* Content Positioning (Cols 2-6 on Desktop) */
        .hero-content {
            position: relative;
            z-index: 2;
            grid-column: 2 / 7; /* Starts at line 2, spans 5 columns */
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 1.5rem;
        }

        /* Typography Styles */
        .hero-title {
            font-family: var(--font-heading);
            font-size: clamp(3rem, 5vw, 5rem);
            font-weight: 600;
            line-height: 1.1;
            color: var(--base-color);
            letter-spacing: -0.02em;
        }

        .hero-description {
            font-size: clamp(1rem, 1.5vw, 1.25rem);
            font-weight: 300;
            line-height: 1.6;
            color: var(--base-color);
            max-width: 90%;
            opacity: 0.9;
            margin-bottom: 1rem;
        }

        /* Call-To-Action Button */
        .btn-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: var(--primary-color);
            color: var(--base-color);
            font-family: var(--font-body);
            font-size: 1rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-decoration: none;
            padding: 1.125rem 2.5rem;
            border-radius: 4px;
            transition: background-color 0.3s ease, transform 0.3s ease;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        }

        .btn-cta:hover {
            background-color: #213a2d; /* Slightly darker shade of primary */
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }

        .btn-cta:focus {
            outline: 2px solid var(--base-color);
            outline-offset: 4px;
        }

        /* Mobile Responsiveness */
        @media (max-width: 992px) {
            .hero-content {
                grid-column: 2 / 10; /* Expand content width on tablets */
            }
        }

        @media (max-width: 768px) {
            .hero {
                grid-template-columns: 1fr; /* Stack layout */
                padding: 0 1.5rem;
                background-position: 60% center; /* Adjust subject visibility */
            }

            /* Adjust overlay to be more solid on mobile for better readability */
            .hero::before {
                background: linear-gradient(
                    180deg, 
                    rgba(47, 48, 45, 0.6) 0%, 
                    rgba(47, 48, 45, 0.8) 100%
                );
            }

            .hero-content {
                grid-column: 1 / -1; /* Spans all columns (1-12 equivalent) */
                text-align: center;
                align-items: center;
                padding-top: 4rem;
                padding-bottom: 4rem;
            }

            .hero-description {
                max-width: 100%;
            }
        }
    </style>
</head>
<body>

    <!-- Responsive Hero Section -->
    <header class="hero" aria-label="Welcome to Aether">
        <div class="hero-content">
            <h1 class="hero-title">Experience Pure Harmony</h1>
            <p class="hero-description">
                Aether brings you sustainably sourced, premium essentials designed to reconnect you with the earth. Discover the balance of luxury and conscious living.
            </p>
            <a href="#discover" class="btn-cta" aria-label="Discover the Aether collection">Discover Aether</a>
        </div>
    </header>

</body>
</html>
```