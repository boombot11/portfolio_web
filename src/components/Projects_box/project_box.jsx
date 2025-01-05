'use client'
import React from 'react';
import './project_box.css'; // External CSS for styling

const projects = [

  { title: 'Task Owl', image: 'task_login.png', type: 'web' },
  { title: 'Student Help', image: 'STUDENT+HELP.png', type: 'web' },
  { title: 'DJS NOVA', image: 'SS3.png', type: 'web' },
  { title: 'DJS CSI app', image: 'CSI.png', type: 'app' },
  { title: 'Hackathon_app (incomplete idk name)', image: 'dy.png', type: 'app' },
  { title: 'Mental Health website', image: 'Mental_health.png', type: 'web' },

];

const ProjectGrid = () => {

  const handleClick = () => {
    // The link to be opened
    const url = 'https://github.com/boombot11?tab=overview&from=2025-01-01&to=2025-01-05';
    // Open the URL in a new tab
    window.open(url, '_blank');
  };

  return (
    <div className='main'>
      <h2 className="projects-heading">Projects</h2>
      <div className="grid-container">
        {projects.map((project, index) => (
          <div className="grid-item-wrapper" key={index}>
            {/* Grid item with hover effects */}
            <div
              onClick={handleClick}
              className="grid-item"
              style={{
                backgroundImage: `url(${project.image})`,
              }}
            >
              <div className="overlay">
                <h3 className="title">{project.type}</h3>
              </div>
            </div>
            {/* Title displayed below the image */}
            <div className="project-name">{project.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectGrid;
