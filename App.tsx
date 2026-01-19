import React, { useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import AIChat from './components/AIChat';
import { MILESTONES, SKILLS } from './constants';

const App: React.FC = () => {
  const typingRef = useRef<HTMLSpanElement>(null);
  const wordIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const words = [
    "Keshav",
    "Software Engineer",
    "Java Full Stack Developer"
  ];
  const speed = 100;
  const delay = 1000;

  useEffect(() => {
    const typeEffect = () => {
      if (!typingRef.current) return;

      const currentWord = words[wordIndexRef.current];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        typingRef.current.textContent = currentWord.substring(0, charIndexRef.current);
      } else {
        charIndexRef.current++;
        typingRef.current.textContent = currentWord.substring(0, charIndexRef.current);
      }

      if (!isDeletingRef.current && charIndexRef.current === currentWord.length) {
        timeoutRef.current = setTimeout(() => {
          isDeletingRef.current = true;
          typeEffect();
        }, delay);
        return;
      } else if (isDeletingRef.current && charIndexRef.current === 0) {
        isDeletingRef.current = false;
        wordIndexRef.current = (wordIndexRef.current + 1) % words.length;
      }

      timeoutRef.current = setTimeout(typeEffect, isDeletingRef.current ? speed / 2 : speed);
    };

    typeEffect();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      message: formData.get('message'),
    };

    const subject = encodeURIComponent(`Contact from ${data.name}`);
    const body = encodeURIComponent(
      `Name: ${data.name}\nEmail: ${data.email}\n\nMessage:\n${data.message}`
    );

    const mailto = `mailto:neokkj11@gmail.com?subject=${subject}&body=${body}`;
    try {
      window.location.href = mailto;
    } catch {
      alert('Please configure an email app to send this message.');
    }
  };

  return (
    <div className="min-h-screen selection:bg-sky-500/30">
      <Navbar />
      {/* <AIChat /> */}

      {/* Hero / About Me Section */}
      <section id="about" className="relative min-h-screen flex items-center pt-20 px-6">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(14,165,233,0.05),transparent_70%)]"></div>
        <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-sky-200 font-semibold mb-4 tracking-wider uppercase text-sm">Hello, I'm <span ref={typingRef}></span></h2>
            <h1 className="text-5xl lg:text-7xl font-extrabold mb-6 leading-[1.1]">
              Engineering the <span className="gradient-text">Future</span> of Ad Tech at Google.
            </h1>
            <p className="text-slate-400 text-lg mb-10 max-w-lg leading-relaxed">
              Software Engineer specialized in building high-performance distributed systems, 
              scalable microservices, and modern web architectures. Passionate about efficiency, 
              clean code, and user friendly solutions.
            </p>
            <div className="flex flex-wrap gap-4">
              <a 
                href="https://drive.google.com/file/d/1rZmnX4e4sSSBPSuIoEX3I-GaHE7Nrtn0/view?usp=sharing" 
                className="px-8 py-4 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-200 transition-all flex items-center gap-2 group shadow-xl"
                target="_blank"
              >
                <span>Download CV</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-y-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              <a 
                href="#contact" 
                className="px-8 py-4 rounded-xl bg-slate-800 text-white font-bold border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-2 shadow-xl"
              >
                Contact Me
              </a>
            </div>
          </div>
          <div className="order-1 md:order-2 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <img 
                src="https://picsum.photos/seed/Keshav/500/500" 
                alt="Profile" 
                className="relative rounded-3xl w-72 h-72 md:w-96 md:h-96 object-cover shadow-2xl grayscale hover:grayscale-0 transition-all duration-700 hover:scale-105"
              />
              <div className="absolute -bottom-6 -right-6 bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-2xl animate-bounce">
                <span className="text-3xl">🚀</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section id="skills" className="py-24 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Technical <span className="text-sky-500">Superpowers</span></h2>
            <div className="w-20 h-1.5 bg-sky-500 mx-auto rounded-full mb-6"></div>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              A diverse toolkit honed through years of building enterprise-grade software 
              at global leaders like Google and Optum.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {SKILLS.map((skill) => (
              <div 
                key={skill.name}
                className="p-8 bg-slate-800 border border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-4 group hover:border-sky-500/50 transition-all hover:translate-y-[-5px] shadow-lg"
              >
                <span className="text-4xl filter group-hover:scale-125 transition-transform duration-300 grayscale group-hover:grayscale-0">
                  {skill.icon}
                </span>
                <span className="font-semibold text-slate-200 text-center">{skill.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Milestones Section */}
      <section id="milestones" className="py-24 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Professional <span className="text-sky-500">Journey</span></h2>
            <div className="w-20 h-1.5 bg-sky-500 mx-auto rounded-full"></div>
          </div>

          <div className="relative">
            {/* The Vertical Line */}
            <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full timeline-line opacity-20 rounded-full hidden md:block"></div>
            
            <div className="space-y-12">
              {MILESTONES.map((milestone, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col md:flex-row items-center w-full ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
                >
                  <div className="md:w-1/2 p-6">
                    <div className={`p-8 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-3xl shadow-xl hover:border-sky-500/30 transition-colors ${idx % 2 === 0 ? 'text-left' : 'text-right'}`}>
                      <span className="inline-block px-4 py-1 bg-sky-500/10 text-sky-400 text-xs font-bold rounded-full mb-4">
                        {milestone.year}
                      </span>
                      <h3 className="text-2xl font-bold mb-1">{milestone.title}</h3>
                      <p className="text-sky-500 font-medium mb-4">{milestone.location}</p>
                      <p className="text-slate-400 leading-relaxed text-sm">
                        {milestone.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Circle Marker */}
                  <div className="absolute left-1/2 transform -translate-x-1/2 w-6 h-6 bg-slate-900 border-4 border-sky-500 rounded-full z-10 hidden md:block"></div>
                  
                  <div className="md:w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <h2 className="text-4xl font-bold mb-6">Let's <span className="text-sky-500">Collaborate</span></h2>
            <p className="text-slate-400 text-lg mb-10 leading-relaxed">
              Have a project in mind or just want to chat about tech? 
              I'm always open to discussing new opportunities or cool technologies.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Email</h4>
                  <p className="text-lg font-semibold">neokkj11@gmail.com</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Location</h4>
                  <p className="text-lg font-semibold">Hyderabad, India</p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-8 md:p-10 bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Name</label>
                <input type="text" name="name" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all" placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Email</label>
                <input type="email" name="email" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all" placeholder="john@example.com" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Message</label>
              <textarea name="message" rows={5} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all" placeholder="How can I help you?"></textarea>
            </div>
            <button className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Send Message
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <a href="#" className="text-2xl font-bold tracking-tighter mb-6 block">
                Keshav<span className="text-sky-500">.DEV</span>
              </a>
              <p className="text-slate-400 max-w-sm leading-relaxed">
                Building robust software solutions that scale. Currently contributing to Google's next-gen advertising platforms.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-6">Quick Links</h4>
              <ul className="space-y-4 text-slate-400">
                <li><a href="#about" className="hover:text-sky-400 transition-colors">About</a></li>
                <li><a href="#skills" className="hover:text-sky-400 transition-colors">Skills</a></li>
                <li><a href="#milestones" className="hover:text-sky-400 transition-colors">Milestones</a></li>
                <li><a href="#contact" className="hover:text-sky-400 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">Social</h4>
              <div className="flex gap-4">
                <a href="https://www.linkedin.com/in/i-keshav/" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                </a>
                <a href="https://github.com/myself-NEO" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                </a>
                <a href="#" className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center text-slate-500 text-sm">
            <p>&copy; {new Date().getFullYear()} Keshav. All rights reserved.</p>
            <p className="flex items-center gap-1">Made with <span className="text-red-500">❤️</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
