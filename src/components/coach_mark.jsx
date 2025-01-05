'use client'
import React, { useState, useEffect } from 'react';

// Custom Coachmark Component that wraps around children components
const CoachMark = ({ children, message }) => {
  const [showCoachmark, setShowCoachmark] = useState(true);

  // Check if the coachmark has been shown before on page load
  useEffect(() => {
    // Check if the flag is in localStorage
    // const coachmarkShown = localStorage.getItem('coachmarkShown');
    
    // if (coachmarkShown) {
    //   setShowCoachmark(false); // If shown before, do not show it again
    // }
  }, []);

  // Disable scrolling when coachmark is shown
  useEffect(() => {
    if (showCoachmark) {
      document.body.style.overflow = 'hidden';  // Lock scrolling
    } else {
      document.body.style.overflow = 'auto';   // Enable scrolling after coachmark is closed
    }

    // Cleanup when component unmounts
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [showCoachmark]);

  const handleClose = () => {
    setShowCoachmark(false);
    localStorage.setItem('coachmarkShown', 'true'); // Save to localStorage that coachmark has been shown
  };

  return (
    <>
      {showCoachmark && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h2>Note</h2>
            <p>{message}</p>
            <button onClick={handleClose} style={styles.button}>OK</button>
          </div>
        </div>
      )}
      {children}
    </>
  );
};

// Styles for the Coachmark component with Glass Effect
const styles = {
  overlay: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',  // Center the coachmark
    zIndex: 1000,
    backdropFilter: 'blur(10px)',         // Apply blur to the background
    backgroundColor: 'rgba(255, 255, 255, 0.3)',  // Semi-transparent background for the "glass" effect
    borderRadius: '8px',                 // Optional: to make the edges rounded
    padding: '20px',
  },
  modal: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',  // Slightly opaque white background for the modal
    padding: '20px',
    display:"flex",
    flexDirection:"column",
    gap:"2rem",
    alignItems:"center", // Fixed typo: "centre" should be "center"
    borderRadius: '8px',
    width: '300px',
    textAlign: 'center',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
    position: 'relative',
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    backgroundColor: '#007bff',
    color: 'white',
    fontSize: '16px',
    borderRadius: '5px',
    cursor: 'pointer',
  },
};

export default CoachMark;
