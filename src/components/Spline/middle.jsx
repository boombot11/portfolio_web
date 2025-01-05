'use client'
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const SplineComponent = dynamic(() => import('../Spline/spline'), {
  ssr: false, // Disable SSR
  loading: () => <p>Loading...</p>,
});

const HelperServer = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true); // Load component when it's in view
          }
        });
      },
      { threshold: 0.1 } // Trigger when 10% of the component is visible
    );

    const element = document.getElementById('spline-container');
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) observer.unobserve(element);
    };
  }, []);

  return (
    <div
      id="spline-container"
      style={{
        width: '100%',
        position: 'relative',
        top: '50px',
        overflow: 'hidden',  // Ensure no overflow if the background is blurred
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginTop: '15px',
          transform: 'translate(-50%, -50%)', // Center the capsule in the container
          width: '90%',  // Adjust width (percentage or fixed value)
          height: '100%', // Adjust height (percentage or fixed value)
          background: 'linear-gradient(to right, rgba(173, 216, 230, 0.6), rgba(255, 255, 204, 0.6))', // Gradient from light blue to light yellow
          backdropFilter: 'blur(10px)',  // Blurring the background
          borderRadius: '50px',  // Capsule-like shape
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)', // Adding shadow for a highlighted effect
          zIndex: -1,  // Keep the background behind the component
        }}
      />
      {isVisible ? <SplineComponent /> : <></>}
    </div>
  );
  
  
};

export default HelperServer;