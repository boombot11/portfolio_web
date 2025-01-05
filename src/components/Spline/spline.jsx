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
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1100) {
        setMinWidth(1300);
      } else {
        setMinWidth(650);
      }
    };

    // Set initial minWidth
    handleResize();

    // Add event listener for resize
    window.addEventListener('resize', handleResize);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const WrapStyle = {
    maxWidth: '1000px',
    minWidth: `${minWidth}px`, // Use dynamic minWidth
    minHeight: '400px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between', // Adjusted from 'space-around' to 'space-between'
    alignItems: 'center',
    padding: '0 30px', // Added horizontal padding to move arrows inward
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
    });

    document.dispatchEvent(event);
    console.log(`Simulated ${key} arrow key press`);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      console.log('hehehehe   ' + event.code);
      simulateKeyPress(event.key);
    };

    // Add event listener to the document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
