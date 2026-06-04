/**
 * Esemble Website - Modern Interactive Script
 * Premium animations, scroll effects, and user interactions
 */

// ==========================================
// NAVIGATION SCROLL BEHAVIOR
// ==========================================

const navbar = document.querySelector('.navbar');
let lastScrollTop = 0;

window.addEventListener('scroll', () => {
  const scrollTop = window.scrollY;
  
  if (scrollTop > 50) {
    navbar.classList.add('scroll-active');
  } else {
    navbar.classList.remove('scroll-active');
  }
  
  lastScrollTop = scrollTop;
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href !== '#' && document.querySelector(href)) {
      e.preventDefault();
      document.querySelector(href).scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ==========================================
// INTERSECTION OBSERVER FOR SCROLL ANIMATIONS
// ==========================================

const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('scroll-slide-up');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll('.why-card, .feature-card, .stat-card, .download-card, .testimonial-card, .benefit-card, .faq-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(40px)';
  observer.observe(el);
});

// ==========================================
// FAQ ACCORDION
// ==========================================

const faqTriggers = document.querySelectorAll('.faq-trigger');

faqTriggers.forEach(trigger => {
  trigger.addEventListener('click', () => {
    const faqId = trigger.dataset.faq;
    const answer = document.getElementById(`faq-${faqId}`);
    
    // Close other FAQs
    document.querySelectorAll('.faq-answer.open').forEach(openAnswer => {
      if (openAnswer.id !== `faq-${faqId}`) {
        openAnswer.classList.remove('open');
        document.querySelector(`[data-faq="${openAnswer.id.replace('faq-', '')}"]`).classList.remove('active');
      }
    });
    
    // Toggle current FAQ
    answer.classList.toggle('open');
    trigger.classList.toggle('active');
  });
});

// ==========================================
// DOWNLOAD BUTTON HANDLERS
// ==========================================

document.querySelectorAll('.download-trigger').forEach(button => {
  button.addEventListener('click', (e) => {
    const os = e.currentTarget.dataset.os;
    const filename = os === 'mac' ? 'Esemble-1.0.0.dmg' : 'Esemble-1.0.0.exe';
    
    // Visual feedback
    const originalText = button.textContent;
    const originalClass = button.className;
    
    button.textContent = '⏳ Preparing...';
    button.disabled = true;
    button.style.opacity = '0.7';
    
    setTimeout(() => {
      button.textContent = '📦 Starting Download...';
      
      // In production, this would redirect to actual download
      // window.location.href = `https://github.com/manojm404/Ensemble/releases/download/v1.0.0/${filename}`;
      
      setTimeout(() => {
        button.textContent = '✓ Download Started!';
        button.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        
        // Show success notification
        showNotification(`🚀 ${filename} download starting...`, 'success');
        
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          button.style.opacity = '1';
          button.style.background = '';
        }, 3000);
      }, 1000);
    }, 1500);
  });
});

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
    z-index: 9999;
    animation: slideUp 300ms ease-out;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideDown 300ms ease-out forwards';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ==========================================
// PARALLAX EFFECT FOR HERO
// ==========================================

const heroSection = document.querySelector('.hero');
const gradientOrbs = document.querySelectorAll('.gradient-orb');

window.addEventListener('mousemove', (e) => {
  if (window.scrollY < window.innerHeight) {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    
    gradientOrbs.forEach((orb, index) => {
      const moveX = (x - 0.5) * 50 * (index + 1);
      const moveY = (y - 0.5) * 50 * (index + 1);
      orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
  }
});

// Reset on mobile
if (window.innerWidth < 768) {
  gradientOrbs.forEach(orb => {
    orb.style.transform = '';
  });
}

// ==========================================
// BUTTON HOVER EFFECTS
// ==========================================

document.querySelectorAll('.btn-primary, .btn-secondary').forEach(button => {
  button.addEventListener('mouseenter', function() {
    if (!this.disabled) {
      this.style.transform = 'translateY(-4px)';
    }
  });
  
  button.addEventListener('mouseleave', function() {
    if (!this.disabled) {
      this.style.transform = 'translateY(0)';
    }
  });
});

// ==========================================
// CARD HOVER EFFECTS
// ==========================================

document.querySelectorAll('.why-card, .feature-card, .stat-card, .download-card, .testimonial-card').forEach(card => {
  card.addEventListener('mouseenter', function() {
    this.style.transition = 'all 300ms ease-out';
  });
});

// ==========================================
// SCROLL PROGRESS INDICATOR (Optional)
// ==========================================

function updateScrollProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrollPercent = (scrollTop / docHeight) * 100;
  
  // Optional: Update a progress bar if you add one
  // document.getElementById('progress-bar').style.width = scrollPercent + '%';
}

window.addEventListener('scroll', updateScrollProgress);

// ==========================================
// ACTIVE LINK HIGHLIGHTING IN NAV
// ==========================================

const sections = document.querySelectorAll('section[id], header[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
  let current = '';
  
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (pageYOffset >= sectionTop - 200) {
      current = section.getAttribute('id');
    }
  });
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href').slice(1) === current) {
      link.classList.add('active');
    }
  });
});

// ==========================================
// RESPONSIVE NAVIGATION TOGGLE (Mobile)
// ==========================================

function initMobileNav() {
  const navLinks = document.querySelector('.nav-links');
  const navToggle = document.querySelector('.nav-toggle');
  
  // If you add a hamburger menu, implement toggle here
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
    });
    
    // Close on link click
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.classList.remove('active');
      });
    });
  }
}

initMobileNav();

// ==========================================
// PERFORMANCE: LAZY LOAD IMAGES
// ==========================================

if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        imageObserver.unobserve(img);
      }
    });
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
}

// ==========================================
// FORM VALIDATION (if added later)
// ==========================================

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================

document.addEventListener('keydown', (e) => {
  // Close FAQ on Escape
  if (e.key === 'Escape') {
    document.querySelectorAll('.faq-answer.open').forEach(answer => {
      answer.classList.remove('open');
      answer.previousElementSibling.classList.remove('active');
    });
  }
  
  // Focus management for accessibility
  if (e.key === 'Tab') {
    document.body.classList.add('keyboard-nav');
  }
});

document.addEventListener('mousedown', () => {
  document.body.classList.remove('keyboard-nav');
});

// ==========================================
// PAGE LOAD ANIMATIONS
// ==========================================

window.addEventListener('load', () => {
  // Trigger entrance animations for hero elements
  document.querySelectorAll('.animate-fade-in, .animate-slide-up, .animate-slide-up-delayed, .animate-slide-up-delayed-2').forEach(el => {
    el.style.visibility = 'visible';
  });
});

// ==========================================
// UTILITY: DETECT DEVICE TYPE
// ==========================================

const isMobile = window.innerWidth < 768;
const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
const isDesktop = window.innerWidth >= 1024;

// Log for debugging
console.log(`Esemble Website Loaded | Device: ${isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile'}`);

// ==========================================
// PERFORMANCE: DEBOUNCE FOR RESIZE
// ==========================================

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Re-check device type and adjust if needed
    location.reload(); // Or implement responsive adjustments
  }, 250);
});

// ==========================================
// ANALYTICS / TRACKING (if using Google Analytics)
// ==========================================

function trackEvent(category, action, label) {
  if (typeof gtag !== 'undefined') {
    gtag('event', action, {
      event_category: category,
      event_label: label
    });
  }
}

// Track button clicks
document.querySelectorAll('.btn-primary, .btn-secondary').forEach(button => {
  button.addEventListener('click', (e) => {
    const text = button.textContent.trim();
    trackEvent('button', 'click', text);
  });
});

// Track download initiation
document.querySelectorAll('.download-trigger').forEach(button => {
  button.addEventListener('click', (e) => {
    const os = e.currentTarget.dataset.os;
    trackEvent('download', 'initiated', os);
  });
});

// ==========================================
// INITIALIZE EVERYTHING
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎼 Esemble Website - Ready for Orchestration');
});
