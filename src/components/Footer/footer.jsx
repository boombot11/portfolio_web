'use client'
import React from 'react';
import './footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <p className="footer-brand">&lt;Sahil.dev&gt;</p>
                <ul className="social-icons">
                    <li>
                        <a href="https://www.instagram.com/sahil._.jadhav_" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/instagram-new.png" alt="Instagram" />
                        </a>
                    </li>
                    <li>
                        <a href="https://github.com/boombot11" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/github.png" alt="GitHub" />
                        </a>
                    </li>
                    <li>
                        <a href="https://www.linkedin.com/in/sahil-jadhav-9b3b25257" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/linkedin.png" alt="LinkedIn" />
                        </a>
                    </li>
                </ul>
                <p className="footer-copy">&copy; 2026 Sahil Jadhav · All Rights Reserved</p>
            </div>
        </footer>
    );
};

export default Footer;
