'use client'
import { motion } from "framer-motion";
import './framer_title.css';

const MyAnimation = () => {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] } }
  };

  return (
    <div className="TopWrap">
      <motion.div
        className="wrapText"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.p className="hero-eyebrow" variants={item}>
          Hey, I&apos;m
        </motion.p>
        <motion.h1 variants={item}>
          Sahil Jadhav
        </motion.h1>
        <motion.p className="hero-subtitle" variants={item}>
          BTech IT &apos;26 &nbsp;·&nbsp; DJ Sanghvi College
        </motion.p>
        <motion.p className="hero-tagline" variants={item}>
          Full-Stack &amp; Mobile Developer building products people love.
        </motion.p>
        <motion.div className="hero-badges" variants={item}>
          {['React', 'Next.js', 'Flutter', 'Python'].map((tech) => (
            <span key={tech} className="badge">{tech}</span>
          ))}
        </motion.div>
        <motion.div className="hero-cta" variants={item}>
          <a href="#circular-animation" className="cta-btn primary">View Projects</a>
          <a href="#contact-me" className="cta-btn secondary">Get In Touch</a>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default MyAnimation;
