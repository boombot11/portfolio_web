'use client';

import React from 'react';
import './project_box.css';

const projects = [
  {
    title: 'Enterprise Financial Regulatory RAG Platform',
    type: 'Internship · Production',
    summary:
      'Hybrid financial regulatory intelligence platform with deterministic and semantic retrieval paths for compliance-grade AI assistance.',
    highlights: [
      'Built vector-less semantic path + zero-LLM structured SQLite path for reliable retrieval.',
      'Implemented Flutter RAG chat and due-diligence workflows with resilient state handling.',
    ],
    stack: ['Python', 'FastAPI', 'Flutter', 'SQLite', 'Docker', 'GCP'],
    // image: '/public/<rag-project-screenshot>.png',
    // liveUrl: 'https://<rag-live-link>',
  },
  {
    title: 'Compliance Audit Workflow Engine',
    type: 'Internship · Production',
    summary:
      'Generalized workflow engine for compliance operations with custom nodes, attachment flow, and revision-aware assignment trails.',
    highlights: [
      'Engineered n8n-like configurable workflow behavior in Java + Spring Boot.',
      'Supported junior-to-senior handoffs, send-back revisions, and auditable action trails.',
    ],
    stack: ['Java', 'Spring Boot', 'Workflow Design', 'Audit Systems'],
    // image: '/public/<workflow-engine-screenshot>.png',
    // liveUrl: 'https://<workflow-live-link>',
  },
  {
    title: 'Financial Data & Notification Automation Platform',
    type: 'Internship · Production',
    summary:
      'Real-time notification and data processing platform integrating company DB updates, scraper bots, and finance APIs at scale.',
    highlights: [
      'Built cron-scheduled notification workflows for IPO, portfolio, birthday, and report updates.',
      'Worked on C# to PostgreSQL migration for large-scale records with threading and pooling concepts.',
    ],
    stack: ['C#', 'PostgreSQL', 'GCP VMs', 'Cron', 'Docker', 'APIs'],
    // image: '/public/<notification-platform-screenshot>.png',
    // liveUrl: 'https://<internal-or-public-link>',
  },
  {
    title: 'SimArch - Visual IaC Orchestrator & Simulator',
    type: 'Personal · Advanced Systems',
    summary:
      'Drag-and-drop architecture simulator with safe emulation mode and real Docker-backed execution mode plus telemetry streaming.',
    highlights: [
      'Built provider-driven orchestration layer with FastAPI/Python backend.',
      'Integrated live WebSocket telemetry for runtime visibility and terminal-like output.',
    ],
    stack: ['FastAPI', 'Python', 'Docker', 'WebSocket', 'Systems Design'],
    // image: '/public/<simarch-screenshot>.png',
    // liveUrl: 'https://<simarch-link>',
  },
];

const ProjectGrid = () => {
  return (
    <section className="projects-section">
      <div className="projects-shell">
        <h2 className="projects-heading">Selected Work</h2>
        <p className="projects-subheading">
          Four high-impact projects focused on production systems, AI reliability, and cloud-scale execution.
        </p>

        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.title}>
              <span className="project-type">{project.type}</span>
              <h3 className="project-title">{project.title}</h3>
              <p className="project-summary">{project.summary}</p>

              <ul className="project-highlights">
                {project.highlights.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              <div className="project-stack">
                {project.stack.map((item) => (
                  <span className="stack-chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>

              <p className="project-note">Links and visuals are intentionally commented out for now.</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectGrid;
