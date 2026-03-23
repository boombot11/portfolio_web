import React from 'react';
import './Skill_list.css';

const skills = [
  {
    category: 'Languages',
    items: [
      { name: 'Python', logo: 'python.png' },
      { name: 'JavaScript', logo: 'javscript.png' },
      { name: 'Dart', logo: 'dart.jpeg' },
    ],
  },
  {
    category: 'Frameworks',
    items: [
      { name: 'React', logo: 'react.png' },
      { name: 'Flutter', logo: 'flutter.png' },
      { name: 'Next.js', logo: 'nextjs.png' },
    ],
  },
  {
    category: 'Databases',
    items: [
      { name: 'SQL', logo: 'sql.png' },
      { name: 'MongoDB', logo: 'mongo.png' },
      { name: 'Firebase', logo: 'download.png' },
    ],
  },
  {
    category: 'Tools',
    items: [
      { name: 'Git', logo: 'git.png' },
    ],
  },
];

const SkillsList = () => {
  return (
    <div className="skills-section">
      <h2 className="skills-heading">
        <span>Skills</span>
      </h2>
      <div className="skills-grid">
        {skills.map((group, i) => (
          <div key={i} className="skill-card">
            <h3 className="skill-category">{group.category}</h3>
            <div className="skill-items">
              {group.items.map((item, j) => (
                <div key={j} className="skill-item">
                  <div className="skill-logo-wrap">
                    <img src={item.logo} alt={item.name} className="skill-logo" />
                  </div>
                  <span className="skill-name">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkillsList;
