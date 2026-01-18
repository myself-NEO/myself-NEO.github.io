
import React, { useState, useEffect } from 'react';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { name: 'About me', href: '#about' },
    { name: 'Skills', href: '#skills' },
    { name: 'Milestones', href: '#milestones' },
    { name: 'Contact', href: '#contact' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 py-3 shadow-xl' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <a href="#" className="text-xl font-bold tracking-tighter hover:opacity-80 transition-opacity">
          KESHAV<span className="text-sky-500">.DEV</span>
        </a>
        
        <div className="hidden md:flex items-center space-x-8">
          {navItems.map((item) => (
            <a 
              key={item.name} 
              href={item.href} 
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              {item.name}
            </a>
          ))}
          <a 
            href="https://drive.google.com/file/d/1rZmnX4e4sSSBPSuIoEX3I-GaHE7Nrtn0/view?usp=sharing" 
            className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/20"
            target="_blank"
          >
            Download CV
          </a>
        </div>

        {/* Mobile menu button could go here if needed, but keeping it simple for world-class feel */}
      </div>
    </nav>
  );
};

export default Navbar;
