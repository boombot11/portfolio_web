import React from 'react';
import styles from './Skill_list.css';
// TechDiv Component (Logo only)
const TechDiv = ({ logoSrc }) => (
  <div style={{display:"inline"}} className="tech-div">
    <img  src={logoSrc} alt="Technology Logo" className="tech-logo" />
  </div>
);

const SkillsList = () => {
  const data = [
    {
      title: "Prog Languages",
      technologies: [
        { logoSrc: "python.png" },
        { logoSrc: "javscript.png" },
        { logoSrc: "dart.jpeg" }
      ]
    },
    {
      title: "Frameworks",
      technologies: [
        { logoSrc: "react.png" },
        { logoSrc: "flutter.png" },
        { logoSrc: "nextjs.png" },
      ]
    },
    {
       title: "Databases",
      technologies: [
        { logoSrc: "sql.png" },
        { logoSrc: "mongo.png" },
        { logoSrc: "download.png" }
      ]
    },
    {
        title:"Github",
        technologies:[
            {logoSrc:"git.png"}
        ]
    }
    // Add other categories here similarly...
  ];

  return (
    <div className="skills-container">
      {data.map((item, index) => (
        <div key={index} className="skill-row">
          <strong>{item.title}:</strong>
          <div className='image-row'>
          {(item.technologies || []).map((tech, techIndex) => (
  <TechDiv key={techIndex} logoSrc={tech.logoSrc} />
))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SkillsList;
