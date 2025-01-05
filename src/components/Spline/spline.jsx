import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Spline from '@splinetool/react-spline';

const ButtonStyle = {
  border: 'solid 1px white',
  fontSize: 'larger',
  padding: '10px',
  width: '50px',
  height: '50px',
};

export default function Splines() {
  const [minWidth, setMinWidth] = useState(500); // Default minWidth

  // Update minWidth based on window size
  const WrapStyle = {
    maxWidth: '1000px',
    minWidth: `${minWidth}px`, // Use dynamic minWidth
    minHeight: '400px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  };

  // Simulate keypresses
  const simulateKeyPress = (key) => {
    const keyCodeMapping = {
      ArrowLeft: 37,
      ArrowRight: 39,
      Enter: 13,
    };

    const event = new KeyboardEvent('keydown', {
      key: key,
      keyCode: keyCodeMapping[key],
      code: key,
      which: keyCodeMapping[key],
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
    console.log(`Simulated ${key} key press`);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1100) {
        setMinWidth(1000);
      } else {
        setMinWidth(650);
      }
    };

    // Set initial minWidth
    handleResize();

    // Add event listener for resize
    window.addEventListener('resize', handleResize);

    // Simulate Enter key press every 4 seconds
    const intervalId = setInterval(() => {
      simulateKeyPress('Enter');
    }, 4000); // Runs every 4 seconds

    const handleKeyDown = (event) => {
      console.log('Key pressed: ' + event.code);
      simulateKeyPress(event.key);
    };

    // Add event listener to the document for keydown
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      clearInterval(intervalId); // Clear the interval on unmount
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <div style={WrapStyle}>
        <button style={ButtonStyle} onClick={() => simulateKeyPress('ArrowLeft')}>
          ←
        </button>
        <Spline scene="https://prod.spline.design/Yo7LJmF5W4GGk-RR/scene.splinecode" />
        <button style={ButtonStyle} onClick={() => simulateKeyPress('ArrowRight')}>
          →
        </button>
      </div>
    </div>
  );
}
