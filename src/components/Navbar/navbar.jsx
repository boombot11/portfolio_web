'use client'
import React, { useState } from 'react';
import './navbar.css'; // Import the external CSS for styling

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className={`navbar ${isOpen ? 'open' : ''}`}>
            <div className="menu-toggle" onClick={toggleMenu}>
                <span className="bar"></span>
                <span className="bar"></span>
                <span className="bar"></span>
            </div>
            <nav className="navbar-links">
            <a onClick={()=>setIsOpen(false)} href="#my-animation">About Me</a>
            <a onClick={()=>setIsOpen(false)} href="#skills">Skills </a>
      <a onClick={()=>setIsOpen(false)} href="#exporter-internship">Internships</a>
      <a onClick={()=>setIsOpen(false)} href="#circular-animation">Project</a>
      <a onClick={()=>setIsOpen(false)} href="#contact-me">Contact </a>
            </nav>
        </div>
    );
};

export default Navbar;