
import React from 'react';
import './navbar.css';

const Navbar = () => {
    return (
        <div className="navbar">
            <a href="#home">Home</a>
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#contact">Contact</a>
        </div>
    );
}

export default Navbar;