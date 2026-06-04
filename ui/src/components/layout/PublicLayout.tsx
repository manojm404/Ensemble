import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, Workflow, ArrowRight, Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const PublicLayout = ({ children }: { children?: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const previousThemeRef = useRef<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    previousThemeRef.current = root.classList.contains('dark') ? 'dark' : 'light';
    root.classList.remove('dark');
    localStorage.setItem('ensemble-theme', 'light');

    return () => {
      if (previousThemeRef.current === 'dark') {
        root.classList.add('dark');
        localStorage.setItem('ensemble-theme', 'dark');
      } else {
        root.classList.remove('dark');
        localStorage.setItem('ensemble-theme', 'light');
      }
    };
  }, []);

  const isAuthenticated = () => {
    return localStorage.getItem('ensemble_auth_token') !== null;
  };

  const handleNavClick = (path: string) => {
    setMobileMenuOpen(false);
    if (path === '/auth' && isAuthenticated()) {
      navigate('/');
    } else {
      navigate(path);
    }
  };

  const navLinks = [
    { name: "Platform", path: "/platform" },
    { name: "Solutions", path: "/solutions" },
    { name: "Enterprise", path: "/enterprise" },
    { name: "About Us", path: "/about" },
    { name: "Pricing", path: "/pricing" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30 font-sans">
      <header 
        className={`fixed top-0 z-50 w-full transition-all duration-300 ${
          scrolled 
            ? 'bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-sm py-4' 
            : 'bg-transparent border-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center gap-3 cursor-pointer group z-50" 
            onClick={() => handleNavClick('/')}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg group-hover:shadow-primary/50 transition-all duration-300">
              <Workflow className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors">Esemble</span>
          </div>
          
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <button
                key={link.name}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(link.path);
                }}
                disabled={link.disabled}
                className={`text-sm font-semibold transition-colors flex items-center gap-1 ${
                  link.disabled 
                    ? 'text-muted-foreground/40 cursor-not-allowed' 
                    : location.pathname === link.path 
                      ? 'text-foreground hover:text-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.name}
                {link.hasDropdown && <ChevronDown className="w-3 h-3 opacity-50" />}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center space-x-5">
            {!isAuthenticated() ? (
              <>
                <button 
                  onClick={() => handleNavClick('/auth')}
                  className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign In
                </button>
                <Button
                  variant="default"
                  className="rounded-full px-6 h-10 font-bold shadow-[0_0_20px_rgba(var(--primary),0.25)] hover:shadow-[0_0_25px_rgba(var(--primary),0.4)] hover:scale-105 transition-all"
                  onClick={() => handleNavClick('/auth')}
                >
                  Get Started
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                className="rounded-full px-6 h-10 font-bold shadow-md hover:scale-105 transition-transform"
                onClick={() => handleNavClick('/')}
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden z-50 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 w-full h-screen bg-background/95 backdrop-blur-2xl flex flex-col pt-24 px-6 md:hidden z-40"
            >
              <div className="flex flex-col gap-6 text-xl font-bold">
                {navLinks.map((link) => (
                <button key={link.name} onClick={() => handleNavClick(link.path)} className="text-left border-b border-border/50 pb-4">
                  {link.name}
                </button>
                ))}
                {!isAuthenticated() ? (
                  <div className="flex flex-col gap-4 mt-8">
                    <Button variant="outline" className="h-12 w-full text-lg" onClick={() => handleNavClick('/auth')}>Sign In</Button>
                    <Button className="h-12 w-full text-lg" onClick={() => handleNavClick('/auth')}>Get Started</Button>
                  </div>
                ) : (
                  <Button className="h-12 w-full text-lg mt-8" onClick={() => handleNavClick('/')}>Dashboard</Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 flex flex-col w-full">
        {children || <Outlet />}
      </main>

      {/* Investor-Ready Footer */}
      <footer className="py-16 px-6 lg:px-8 border-t border-border/50 bg-background relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-6">
              <Workflow className="w-6 h-6 text-primary" />
              <span className="text-2xl font-black tracking-tight text-foreground">Esemble</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The operating system for the AI enterprise. Orchestrating intelligent agents to scale your workforce infinitely.
            </p>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Platform</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Agent Registry</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Workflow Builder</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Enterprise Security</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Integrations</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Security Overview</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Esemble AI Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/50">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Systems Operational
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
