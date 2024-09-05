import React from 'react';
import './project_box.css'; // External CSS for styling

const projects = [
  { title: 'Project 1', image: '/path/to/image1.jpg' },
  { title: 'Project 2', image: '/path/to/image2.jpg' },
  { title: 'Project 3', image: '/path/to/image3.jpg' },
  { title: 'Project 4', image: '/path/to/image4.jpg' },
  { title: 'Project 5', image: '/path/to/image5.jpg' },
  { title: 'Project 6', image: '/path/to/image6.jpg' },
];

const ProjectGrid = () => {
  return (
    <div className='main'>
    <div className="grid-container">
      {projects.map((project, index) => (
        <div className="grid-item" key={index} style={{ backgroundImage: `url(${project.image})` }}>
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