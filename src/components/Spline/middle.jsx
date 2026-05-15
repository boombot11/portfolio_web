'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const SplineComponent = dynamic(() => import('../Spline/spline'), {
  ssr: false,
  loading: () => <p className="spline-loading">Loading interactive model...</p>,
});

const HelperServer = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.2 }
    );

    const element = document.getElementById('spline-container');
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, []);

  return <div id="spline-container">{isVisible ? <SplineComponent /> : <p className="spline-loading">Scroll to load model...</p>}</div>;
};

export default HelperServer;
