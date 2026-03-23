'use client';

import { useState } from 'react';
import './contact.css';

export default function ContactMe() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [status, setStatus] = useState('idle'); // idle | loading | success | error

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', phone: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="background">
      <div className="container">
        <div className="screen">
          <div className="screen-header">
            <div className="screen-header-left">
              <div className="screen-header-button close"></div>
              <div className="screen-header-button maximize"></div>
              <div className="screen-header-button minimize"></div>
            </div>
            <div className="screen-header-right">
              <div className="screen-header-ellipsis"></div>
              <div className="screen-header-ellipsis"></div>
              <div className="screen-header-ellipsis"></div>
            </div>
          </div>

          <div className="screen-body">
            <div className="screen-body-item left">
              <div className="app-title">
                <span>CONTACT</span>
                <span>ME</span>
              </div>
              <div className="app-contact">
                <a
                  href="mailto:sahiljadhav2769@gmail.com"
                  className="contact-link"
                >
                  sahiljadhav2769@gmail.com
                </a>
                <span>+91 8828181102</span>
              </div>
            </div>

            <div className="screen-body-item">
              <form className="app-form" onSubmit={handleSubmit}>
                <div className="app-form-group">
                  <input
                    className="app-form-control"
                    placeholder="NAME"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="app-form-group">
                  <input
                    className="app-form-control"
                    placeholder="EMAIL"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="app-form-group">
                  <input
                    className="app-form-control"
                    placeholder="CONTACT NO (optional)"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    autoComplete="tel"
                  />
                </div>
                <div className="app-form-group message">
                  <textarea
                    className="app-form-control"
                    placeholder="MESSAGE"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={4}
                  />
                </div>
                <div className="app-form-group buttons">
                  {status === 'success' && (
                    <span className="form-status success">
                      ✓ Message sent! I&apos;ll get back to you soon.
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="form-status error">
                      Failed to send.{' '}
                      <a href="mailto:sahiljadhav2769@gmail.com" className="contact-link">
                        Email me directly
                      </a>
                    </span>
                  )}
                  <button
                    className="app-form-button"
                    type="submit"
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? 'SENDING...' : 'SEND'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
