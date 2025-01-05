"use client";
import React, { useState, useEffect } from "react";
import InternshipDetails from "./internship";
import styles from './style.css';

const ExporterInternship = () => {
  const [details, setDetails] = useState([]);

  useEffect(() => {
    fetch("/internship.txt")
      .then((response) => response.text())
      .then((text) => {
        console.log(text);
        // Split the content based on your custom separator
        const internships = text.split("__seperator__");
    
        const parsedDetails = internships.map(internship => {
          const lines = internship.trim().split("\n");
          let title = "";
          let pos = "";
          let description = "";
          console.log('yyyyyy')
        console.log(internship)
        console.log('yyyyyy')
          lines.forEach(line => {
            if (line.startsWith("Title: ")) {
              title = line.split(": ")[1];
            } else if (line.startsWith("Position: ")) {
              pos = line.split(": ")[1];
            } else if (line.startsWith("Description: ")) {
              description = line.split(": ")[1];
            } else {
              description += ` ${line.trim()}`; // Concatenate additional description lines
            }
          });
  
          return { title, pos, description };
        });
        console.log('xxxxxxxxxxxxxxx')
console.log(parsedDetails)
        setDetails(parsedDetails);
      })
      .catch((error) => console.error("Error loading the file:", error));
  }, []);

  return (
    <div id="export">
      {details.map((detail, index) => (
        <InternshipDetails
          key={index}
          title={detail.title}
          pos={detail.pos}
          description={detail.description}
        />
      ))}
    </div>
  );
};

export default ExporterInternship;
