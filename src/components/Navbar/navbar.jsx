'use client'
import React, { useState, useEffect } from 'react';
import './navbar.css';

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const close = () => setIsOpen(false);

    return (
        <nav className={`navbar ${isOpen ? 'open' : ''} ${scrolled ? 'scrolled' : ''}`}>
            <div className="brand">
                <span className="brand-name">&lt;Sahil.dev&gt;</span>
            </div>

            <button className="menu-toggle" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
                <span className={`bar ${isOpen ? 'open' : ''}`}></span>
                <span className={`bar ${isOpen ? 'open' : ''}`}></span>
                <span className={`bar ${isOpen ? 'open' : ''}`}></span>
            </button>

            <div className="navbar-links">
                <a onClick={close} href="#my-animation">About</a>
                <a onClick={close} href="#exporter-internship">Internships</a>
                <a onClick={close} href="#skills">Skills</a>
                <a onClick={close} href="#circular-animation">Projects</a>
                <a onClick={close} id="contact-button" href="#contact-me">Contact Me</a>
            </div>
        </nav>
    );
};

export default Navbar;
