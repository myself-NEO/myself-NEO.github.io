
import React, { useState, useEffect } from 'react';

interface NavbarProps {
  /** Always use the opaque style (for pages without a hero behind the navbar). */
  solid?: boolean;
  /** href of the nav item to highlight as the current page. */
  activeHref?: string;
}

const Navbar: React.FC<NavbarProps> = ({ solid = false, activeHref }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const closeMenu = () => setIsMenuOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const navItems = [
    { name: 'About me', href: '#about' },
    { name: 'Skills', href: '#skills' },
    { name: 'Milestones', href: '#milestones' },
    { name: 'Now', href: '#currently-working' },
    { name: 'System Design', href: '#system-design' },
    { name: 'Contact', href: '#contact' },
  ];

  const isOpaque = solid || isScrolled || isMenuOpen;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isMenuOpen ? 'bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 py-3 shadow-xl' : isOpaque ? 'bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 py-3 shadow-xl' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <a href="#" className="text-xl font-bold tracking-tighter hover:opacity-80 transition-opacity">
          KESHAV<span className="text-sky-500">.DEV</span>
        </a>

        <div className="hidden lg:flex items-center space-x-8">
          {navItems.map((item) => (
            <a
              key={item.name}
              href={item.href}
              aria-current={item.href === activeHref ? 'page' : undefined}
              className={`text-sm font-medium whitespace-nowrap transition-colors ${item.href === activeHref ? 'text-sky-400' : 'text-slate-300 hover:text-white'}`}
            >
              {item.name}
            </a>
          ))}
          <a
            href="https://drive.google.com/file/d/11jcJIHQkJFY-EHEQiwOlQCGDA1l2C_7o/view?usp=sharing"
            className="px-5 py-2 rounded-full whitespace-nowrap bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/20"
            target="_blank"
          >
            Download CV
          </a>
        </div>

        <button
          type="button"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {isMenuOpen && (
        <div id="mobile-nav" className="lg:hidden border-t border-slate-800 mt-3">
          <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col">
            {navItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                aria-current={item.href === activeHref ? 'page' : undefined}
                className={`py-3 text-base font-medium border-b border-slate-800/60 last:border-0 transition-colors ${item.href === activeHref ? 'text-sky-400' : 'text-slate-300 hover:text-white'}`}
              >
                {item.name}
              </a>
            ))}
            <a
              href="https://drive.google.com/file/d/11jcJIHQkJFY-EHEQiwOlQCGDA1l2C_7o/view?usp=sharing"
              className="mt-3 mb-1 px-5 py-2.5 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold text-center transition-colors"
              target="_blank"
            >
              Download CV
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
