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

const WrapStyle = {
  maxWidth: '1000px',
  minHeight: '400px',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
};

// Simulate keypresses
const simulateKeyPress = (key, number) => {
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

const Timer = setTimeout(() => {
  simulateKeyPress('Enter');
  console.log('xxxxxxxxxxxxxxxxxxxxxxxxxx');
  Repeat();
}, 50000);

function Repeat() {
  Timer;
}

export default function Splines() {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    Repeat();
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
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center',alignItems:'center' }}>
      <motion.div
        style={WrapStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        onAnimationComplete={() => setLoad(true)}
      >
        <button style={ButtonStyle} onClick={() => simulateKeyPress('ArrowLeft', 37)}>
          ←
        </button>
        <Spline scene="https://prod.spline.design/Yo7LJmF5W4GGk-RR/scene.splinecode" />
        <button style={ButtonStyle} onClick={() => simulateKeyPress('ArrowRight', 39)}>
          →
        </button>
      </motion.div>
     
    </div>
  );
}
