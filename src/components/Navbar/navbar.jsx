'use client'
import React, { useState } from 'react';
import './navbar.css'; // Import the external CSS for styling

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };
    const naem = "<Sahil.dev>"
    return (
        <div className={`navbar ${isOpen ? 'open' : ''}`}>
            <div className="brand">
                <span className="brand-name">{naem}</span>
            </div>
            <div className="menu-toggle" onClick={toggleMenu}>
                <span className="bar"></span>
                <span className="bar"></span>
                <span className="bar"></span>
            </div>
            <nav className="navbar-links">

                <a onClick={() => setIsOpen(false)}  href="#my-animation">About</a>
                <a onClick={() => setIsOpen(false)} href="#exporter-internship">Internships</a>
                <a onClick={() => setIsOpen(false)} href="#circular-animation">Project</a>
                {/* <a onClick={() => setIsOpen(false)} id="contact-button" href="#contact-me">Contact</a> */}
                <a onClick={() => setIsOpen(false)} id="contact-button" href="#contact-me">Contact Me</a>

            </nav>
         
        </div>
    );
};

export default Navbar;
