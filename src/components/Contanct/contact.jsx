'use client';

import './contact.css';

export default function ContactMe() {
  const handleSubmit = async (e, message) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: message,
      });

      if (response.ok) {
        setFormData({ name: '', email: '', phone: '' }); // Clear form
      } else {
        // Handle error
      }
    } catch (error) {
      // Handle error
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
                <span>Me **NodeMailer not working for now </span>
              </div>
              <div className="app-contact">sahiljadhav2769@gmail.com  +91 8828181102</div>
            </div>
            <div className="screen-body-item">
              <div className="app-form">
                <div className="app-form-group">
                  <input className="app-form-control" placeholder="NAME" />
                </div>
                <div className="app-form-group">
                  <input className="app-form-control" placeholder="EMAIL" />
                </div>
                <div className="app-form-group">
                  <input className="app-form-control" placeholder="CONTACT NO" />
                </div>
                <div className="app-form-group message">
                  <textarea className="app-form-control" placeholder="MESSAGE"></textarea>
                </div>
                <div className="app-form-group buttons">
                  <button
                    className="app-form-button"
                    onClick={(e) => handleSubmit(e, document.getElementById("message").value)}
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
