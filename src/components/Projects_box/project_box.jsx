'use client'
import React from 'react';
import './project_box.css';

const projects = [
  {
    title: 'Task Owl',
    image: 'task_login.png',
    type: 'Web App',
    description: 'Task management web app',
    github: 'https://github.com/boombot11',
  },
  {
    title: 'Student Help',
    image: 'STUDENT+HELP.png',
    type: 'Web App',
    description: 'Student resource platform',
    github: 'https://github.com/boombot11',
  },
  {
    title: 'DJS NOVA',
    image: 'SS3.png',
    type: 'Web App',
    description: 'College fest website',
    github: 'https://github.com/boombot11',
  },
  {
    title: 'DJS CSI App',
    image: 'CSI.png',
    type: 'Mobile App',
    description: 'Flutter mobile app for DJS CSI',
    github: 'https://github.com/boombot11',
  },
  {
    title: 'Hackathon App',
    image: 'dy.png',
    type: 'Mobile App',
    description: 'Hackathon project app',
    github: 'https://github.com/boombot11',
  },
  {
    title: 'Mental Health Website',
    image: 'Mental_health.png',
    type: 'Web App',
    description: 'Mental health awareness site',
    github: 'https://github.com/boombot11',
  },
];

const ProjectGrid = () => {
  return (
    <div className="projects-main">
      <h2 className="projects-heading">
        <span>Projects</span>
      </h2>
      <div className="grid-container">
        {projects.map((project, index) => (
          <div
            className="grid-item-wrapper"
            key={index}
            onClick={() => window.open(project.github, '_blank')}
          >
            <div
              className="grid-item"
              style={{ backgroundImage: `url(${project.image})` }}
            >
              <div className="overlay">
                <span className="overlay-type">{project.type}</span>
                <p className="overlay-desc">{project.description}</p>
                <span className="overlay-cta">View on GitHub →</span>
              </div>
            </div>
            <div className="project-name">{project.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectGrid;
