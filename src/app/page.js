'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useTransform, useViewportScroll } from 'framer-motion';
import SplineComponent from '@/components/Spline/Exporter';

const navItems = [
  { id: 'hero', label: 'Home' },
  { id: 'interactive', label: 'Interactive' },
  { id: 'work', label: 'Work' },
  { id: 'experience', label: 'Experience' },
  { id: 'research', label: 'Research' },
  { id: 'skills', label: 'Skills' },
  { id: 'contact', label: 'Contact' },
];

const projects = [
  {
    title: 'Enterprise Financial Regulatory RAG Platform',
    tag: 'Internship / Production',
    summary:
      'Hybrid financial intelligence platform with deterministic retrieval rails built for compliance-grade trust and speed.',
    highlights: [
      'Designed a vector-less semantic retrieval path and zero-LLM SQLite path for high-confidence lookups.',
      'Shipped Flutter RAG chat workflows with resilient session handling and streaming UX.',
      'Supported Dockerized CI/CD and deployment patterns spanning GKE, Cloud Run, and Artifact Registry workflows.',
    ],
    stack: ['Python', 'FastAPI', 'Flutter', 'SQLite', 'Docker', 'GCP'],
    media: [
      { label: 'RAG Backend', src: '/rag_backend_chheV0dFlx.png' },
      { label: 'RAG UI', src: '/rag_ui_ss_pRMF7mVxnm.png' },
    ],
    // deployedLink: 'https://<rag-live-link>',
    // repoLink: 'https://github.com/<rag-repo>',
  },
  {
    title: 'Time-Table Gen Software',
    tag: 'Academic / Production Use',
    summary:
      'Automated timetable generation system used by departments, built for constraint-heavy scheduling and low-friction operations.',
    highlights: [
      'Engineered scheduling logic with conflict checks and dynamic multi-department mapping support.',
      'Designed modular macro pipelines for parsing, formatting, duplicate stats, and rule validations.',
      'Reduced manual overhead through an operator-friendly UI wrapper over complex execution flows.',
    ],
    stack: ['Automation', 'Excel Macros', 'Scheduling Logic', 'Data Validation'],
    media: [
      { label: 'Time-Table Backend', src: '/tt_gen_backend.png' },
      { label: 'Time-Table UI', src: '/tt_ui.png' },
    ],
    // deployedLink: 'https://<tt-live-link>',
    // repoLink: 'https://github.com/<tt-repo>',
  },
  {
    title: 'SimArch - Visual IaC Orchestrator and Simulator',
    tag: 'Personal / Advanced Systems',
    summary:
      'Interactive architecture platform with dual-mode runtime: safe simulation or real Docker-backed execution.',
    highlights: [
      'Engineered a provider-driven orchestration backend using FastAPI and Python.',
      'Implemented live WebSocket telemetry streams including terminal-style ANSI output.',
      'Built drag-and-drop architecture composition with runtime visibility and execution feedback loops.',
    ],
    stack: ['FastAPI', 'Python', 'WebSocket', 'Docker', 'Systems Design'],
    media: [
      { label: 'SimArch Backend', src: '/sim_arch_backend_G0wmSfstSN.png' },
      { label: 'SimArch UI', src: '/simarh_ui_autsPNGEow.png' },
    ],
    // deployedLink: 'https://<simarch-link>',
    // repoLink: 'https://github.com/<simarch-repo>',
  },
  {
    title: 'Compliance Audit Workflow Engine',
    tag: 'Internship / Production',
    summary:
      'Generalized workflow engine for compliance teams with traceable attachment flow and revision-aware approvals.',
    highlights: [
      'Built in Java and Spring Boot with dynamic custom nodes inspired by n8n-style orchestration.',
      'Implemented pass-on trails, send-back revisions, and clear assignee transitions for live audit operations.',
      'Created a reusable schema model to keep workflows flexible across compliance use cases.',
    ],
    stack: ['Java', 'Spring Boot', 'Workflow Design', 'Audit Systems'],
    media: [
      { label: 'Workflow Backend Placeholder', src: '' },
      { label: 'Workflow UI Placeholder', src: '' },
    ],
    // deployedLink: 'https://<workflow-live-link>',
    // repoLink: 'https://github.com/<workflow-repo>',
  },
];

const experiences = [
  {
    role: 'Software Development Intern',
    company: 'JM Financial',
    period: '202X - Present',
    bullets: [
      'Architected hybrid RAG pathways for regulatory intelligence and enterprise-grade trust.',
      'Built a visual compliance workflow engine in Java Spring Boot for live audit operations.',
      'Worked across cloud delivery on GKE, Cloud Run, VM schedulers, and storage workflows.',
      'Scaled data and notification systems with strong automation and production reliability focus.',
    ],
  },
  {
    role: 'Software Engineer Intern',
    company: 'Tata Digital Pvt. Ltd.',
    period: 'Jun 2024 - Aug 2024',
    bullets: [
      'Built app features including authentication and location experiences for high-traffic products.',
      'Improved sonic/audio responsiveness and reduced user-perceived latency.',
      'Collaborated in Agile delivery cycles across product and engineering stakeholders.',
    ],
  },
];

const skills = {
  languages: ['Python', 'Java', 'Dart', 'JavaScript', 'C#', 'SQL'],
  frameworks: ['FastAPI', 'Spring Boot', 'Flutter', 'React', 'Next.js'],
  cloud: ['Docker', 'Kubernetes (GKE)', 'Cloud Run', 'GCP VMs', 'Artifact Registry', 'PostgreSQL', 'MongoDB'],
  live: [
    'Adapts quickly to new architectures and team workflows.',
    'Moves across backend, frontend, data, and infra without losing delivery speed.',
    'Uses AI effectively with deterministic fallback design when reliability matters.',
    'Ships production-minded solutions with clear communication and ownership.',
  ],
};

function MediaSlot({ src, alt, label, ratio = 'wide' }) {
  return (
    <div className={`media-slot media-${ratio}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="media-image"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="media-placeholder" aria-label={label}>
          <span className="placeholder-icon">+</span>
          <p>{label}</p>
          <small>Add image path in `page.js`</small>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState('hero');
  const { scrollY, scrollYProgress } = useViewportScroll();
  const orbOneY = useTransform(scrollY, [0, 1600], [0, -220]);
  const orbTwoY = useTransform(scrollY, [0, 1600], [0, 180]);
  const grainShift = useTransform(scrollY, [0, 2000], [0, 160]);

  const metricItems = useMemo(
    () => [
      { label: 'Internships', value: '2+' },
      { label: 'High-impact projects', value: '4' },
      { label: 'Core stacks', value: 'Full-stack + Cloud + AI' },
      { label: 'Current CGPA', value: '8.6 / 10' },
    ],
    []
  );

  useEffect(() => {
    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter(Boolean);

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.45, rootMargin: '-20% 0px -30% 0px' }
    );

    sections.forEach((section) => sectionObserver.observe(section));

    const revealElements = document.querySelectorAll('[data-reveal]');
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    revealElements.forEach((el) => revealObserver.observe(el));

    return () => {
      sectionObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  return (
    <div className="portfolio-root">
      <motion.div className="scroll-progress" style={{ scaleX: scrollYProgress }} />

      <motion.div className="orb orb-one" style={{ y: orbOneY }} />
      <motion.div className="orb orb-two" style={{ y: orbTwoY }} />
      <motion.div className="grain-layer" style={{ y: grainShift }} />

      <header className="top-nav">
        <a href="#hero" className="brand">
          {'<Sahil.dev>'}
        </a>
        <nav>
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={activeSection === item.id ? 'active' : ''}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section id="hero" className="hero section-shell">
          <div className="hero-content" data-reveal>
            <p className="eyebrow">B.Tech IT 2026 | DJ Sanghvi College of Engineering</p>
            <h1>
              Building production-grade AI systems, cloud pipelines, and high-signal product experiences.
            </h1>
            <p className="hero-summary">
              I design and ship software across backend architecture, data scale, infra delivery, and polished UI.
              My focus is combining reliability, speed, and strong engineering storytelling.
            </p>
            <div className="hero-actions">
              <a href="#work">Explore Selected Work</a>
              <a href="mailto:sahiljadhav2769@gmail.com" className="secondary">
                sahiljadhav2769@gmail.com
              </a>
            </div>
          </div>
          <div className="hero-metrics" data-reveal>
            <MediaSlot
              src=""
              alt="Profile or hero visual"
              label="Hero / Profile Image Placeholder"
              ratio="tall"
            />
            {metricItems.map((metric) => (
              <article key={metric.label}>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section id="interactive" className="section-shell">
          <div className="section-heading" data-reveal>
            <p>Interactive Lab</p>
            <h2>Keep scrolling, then use keyboard arrows or UI buttons to control the Spline model.</h2>
          </div>
          <div className="interactive-showcase" data-reveal>
            <div className="interactive-note">
              <span>Controls</span>
              <p>Use `Left Arrow` and `Right Arrow` keys on desktop. You can also use on-screen controls and pulse with `Enter`.</p>
            </div>
            <SplineComponent />
          </div>
        </section>

        <section id="work" className="section-shell">
          <div className="section-heading" data-reveal>
            <p>Selected Work</p>
            <h2>High-impact builds with backend + UI snapshots.</h2>
          </div>
          <div className="project-grid">
            {projects.map((project, index) => (
              <article className="project-card" data-reveal key={project.title} style={{ transitionDelay: `${index * 90}ms` }}>
                <div className="project-media-grid">
                  {project.media.map((media) => (
                    <div key={`${project.title}-${media.label}`}>
                      <MediaSlot
                        src={media.src}
                        alt={`${project.title} ${media.label}`}
                        label={`${project.title} ${media.label}`}
                      />
                      <p className="media-caption">{media.label}</p>
                    </div>
                  ))}
                </div>
                <span className="project-tag">{project.tag}</span>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <ul>
                  {project.highlights.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="chip-row">
                  {project.stack.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <small>Links are ready in code comments; replace when you want them live.</small>
              </article>
            ))}
          </div>
        </section>

        <section id="experience" className="section-shell split-layout">
          <aside className="sticky-note" data-reveal>
            <p>Experience</p>
            <h2>Internship work with real production constraints.</h2>
          </aside>
          <div className="timeline">
            {experiences.map((item, index) => (
              <article className="timeline-card" data-reveal key={item.company} style={{ transitionDelay: `${index * 100}ms` }}>
                <p className="period">{item.period}</p>
                <h3>{item.role}</h3>
                <h4>{item.company}</h4>
                <ul>
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="research" className="section-shell">
          <div className="research-card" data-reveal>
            <p>Research</p>
            <h2>Advancements in Data Augmentation using Computer Vision Techniques</h2>
            <ul>
              <li>Enhanced DiffuseMix-style augmentation for stronger model robustness.</li>
              <li>Built saliency overlays, dynamic masking pipelines, and synthetic pattern generation with OpenCV.</li>
              <li>Applied methods for high-variance domains like medical and satellite imagery workflows.</li>
            </ul>
          </div>
        </section>

        <section id="skills" className="section-shell split-layout">
          <aside className="sticky-note" data-reveal>
            <p>Skills</p>
            <h2>Core stack and live execution strengths.</h2>
          </aside>
          <div className="skills-panel" data-reveal>
            <div>
              <h3>Languages</h3>
              <div className="chip-row">
                {skills.languages.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
            <div>
              <h3>Frameworks and Product Stack</h3>
              <div className="chip-row">
                {skills.frameworks.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
            <div>
              <h3>Cloud, DevOps and Data</h3>
              <div className="chip-row">
                {skills.cloud.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
            <div>
              <h3>Live Skills</h3>
              <ul>
                {skills.live.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="contact" className="section-shell">
          <div className="contact-card" data-reveal>
            <p>Let us build something meaningful.</p>
            <h2>Available for software engineering opportunities and high-impact collaborations.</h2>
            <div className="contact-actions">
              <a href="mailto:sahiljadhav2769@gmail.com">Email</a>
              <a href="tel:+918828181102" className="secondary">
                Call
              </a>
              <a href="https://github.com/boombot11" target="_blank" rel="noreferrer" className="secondary">
                GitHub
              </a>
              <a
                href="https://portfolio-web-two-self.vercel.app/"
                target="_blank"
                rel="noreferrer"
                className="secondary"
              >
                Current Deploy
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
