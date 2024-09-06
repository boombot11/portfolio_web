'use client'
import React from 'react';
import './footer.css'; // External CSS for styling

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <ul className="social-icons">
                    <li>
                        <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/instagram-new.png" alt="Instagram" />
                        </a>
                    </li>
                    <li>
                        <a href="https://www.github.com" target="_blank" rel="noopener noreferrer">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/github.png" alt="GitHub" />
                        </a>
                    </li>
                    <li>
                        <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer">
                            <img src="https://img.icons8.com/ios-filled/50/ffffff/linkedin.png" alt="LinkedIn" />
                        </a>
                    </li>
                </ul>
                <p>&copy; 2024 Adam | All Rights Reserved</p>
            </div>
        </footer>
    );
};

export default Footer;