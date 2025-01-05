'use client'
import React from 'react';
import './project_box.css'; // External CSS for styling

const projects = [
  { title: 'web', image: 'task_login.png' },
  { title: 'web', image: 'STUDENT+HELP.png' },
  { title: 'web', image: 'SS2.png' },
  { title: 'web', image: 'SS3.png' },
  { title: 'app', image: 'CSI.png' },
  { title: 'app', image: 'dy.png' },
  { title: 'web', image: 'Mental_health.png' },
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
      <div className="grid-container">
        {projects.map((project, index) => (
          <div
            onClick={handleClick}
            className="grid-item"
            key={index}
            style={{
              backgroundImage: `url(${project.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="overlay">
              <h3 className="title">{project.title}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectGrid;
