"use client"
import React, { useState } from "react";
import {motion } from "framer-motion"
const InternshipDetails = ({ title, pos, description }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleReadMore = (event) => {
    event.preventDefault();
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div
    style={styles.container}
    initial={{ x: -200, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    transition={{ duration: 3, ease: "easeOut" }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true, amount: 0.8 }} // Only animate once
  >
    <a href="#" onClick={(e)=>e.preventDefault()}>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <div className="container" style={styles.container}>
      <h2 style={styles.title}>{title}</h2>
      <h4 style={styles.pos}>{pos}</h4>
      <div style={styles.description}>
        {isExpanded ? description: `${description.substring(0, 100)}...`}
        <div
          onClick={toggleReadMore}
          style={styles.readMore}
        >
          {isExpanded ? " Read less" : " Read more"}
        </div>
      </div>
    </div>
    </a>
  </motion.div>
  );
};

const styles = {
  container: {
    padding: "20px",
    border: "none",
    borderRadius: "5px",
    maxWidth: "800px",
    margin: "20px auto",

  },
  title: {
    marginBottom: "5px",
    fontSize: "4rem",
    color: "#333",
  },
  pos: {
    marginBottom: "15px",
    fontSize: "2rem",
    color: "#555",
  },
  description: {
    fontSize: "16px",
    color: "#666",
    lineHeight: "3",
  },
  readMore: {
    color: "#007bff",
    cursor: "pointer",
    fontWeight: "bold",
  },
};

export default InternshipDetails;