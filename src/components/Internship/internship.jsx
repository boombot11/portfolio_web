"use client"
import React, { useState } from "react";

const InternshipDetails = ({ title, pos, description }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleReadMore = (event) => {
    event.preventDefault();
    setIsExpanded(!isExpanded);
  };

  return (
    <a href="#" onClick={(e)=>e.preventDefault()}>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <div className="container" style={styles.container}>
      <h2 style={styles.title}>{title}</h2>
      <h4 style={styles.pos}>{pos}</h4>
      <p style={styles.description}>
        {isExpanded ? description: `${description.substring(0, 100)}...`}
        <div
          onClick={toggleReadMore}
          style={styles.readMore}
        >
          {isExpanded ? " Read less" : " Read more"}
        </div>
      </p>
    </div>
    </a>
  
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