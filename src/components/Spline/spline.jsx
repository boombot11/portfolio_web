'use client';

import Spline from '@splinetool/react-spline';

const keyMap = {
  ArrowLeft: 37,
  ArrowRight: 39,
  Enter: 13,
};

function triggerKey(key) {
  const code = keyMap[key];
  if (!code) {
    return;
  }

  const downEvent = new KeyboardEvent('keydown', {
    key,
    code: key,
    keyCode: code,
    which: code,
    bubbles: true,
    cancelable: true,
  });

  const upEvent = new KeyboardEvent('keyup', {
    key,
    code: key,
    keyCode: code,
    which: code,
    bubbles: true,
    cancelable: true,
  });

  document.dispatchEvent(downEvent);
  document.dispatchEvent(upEvent);
}

export default function Splines() {
  return (
    <div className="spline-shell">
      <div className="spline-controls" aria-label="Spline controls">
        <button type="button" onClick={() => triggerKey('ArrowLeft')}>
          Left
        </button>
        <button type="button" className="pulse" onClick={() => triggerKey('Enter')}>
          Pulse
        </button>
        <button type="button" onClick={() => triggerKey('ArrowRight')}>
          Right
        </button>
      </div>

      <div className="spline-canvas">
        <Spline scene="https://prod.spline.design/Yo7LJmF5W4GGk-RR/scene.splinecode" />
      </div>
    </div>
  );
}
