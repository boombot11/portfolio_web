import { useState, useLayoutEffect, useRef } from 'react';

const CoachMark = ({ targetId, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const coachMarkRef = useRef(null);

  useLayoutEffect(() => {
    const targetElement = document.getElementById(targetId);
    if (targetElement && coachMarkRef.current) {
      // Get the position of the target element
      const rect = targetElement.getBoundingClientRect();
      // Calculate the position of the coach mark with a slight offset
      setPosition({
        top: rect.top + window.scrollY + rect.height / 2 - coachMarkRef.current.offsetHeight / 2,
        left: rect.left + window.scrollX + rect.width + 20, // 20px offset to the right
      });
      setIsVisible(true);
    }

    // Clean up if the component is removed
    return () => setIsVisible(false);
  }, [targetId]);

  const handleScroll = () => {
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 50, // scroll a little above the target
        behavior: 'smooth',
      });
    }
  };

  return isVisible ? (
    <div
      ref={coachMarkRef}
      className="coach-mark"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px 15px',
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <p>This is the Coach Mark for your section!</p>
      <button onClick={onClose} style={{ marginLeft: '10px' }}>Close</button>
      <button onClick={handleScroll} style={{ marginLeft: '10px' }}>Scroll to Section</button>
    </div>
  ) : null;
};

export default CoachMark;
