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
    <div id="spline-container" style={{ width: '100%' }}>
      {isVisible ? <SplineComponent /> : <></>}
    </div>
  );
};

export default HelperServer;