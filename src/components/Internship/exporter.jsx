"use client"
import React, { useState, useEffect } from "react";
import InternshipDetails from "./internship";
import styles from './style.css'

const ExporterInternship = () => {
  const [details, setDetails] = useState({
    title: "",
    pos: "",
    description: "",
  });

  useEffect(() => {
    fetch("/internship.txt")
      .then((response) => response.text())
      .then((text) => {
        console.log(text)
        const lines = text.split("\n");
        let title = "";
        let pos = "";
        let description = "";

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

        setDetails({ title, pos, description });
      })
      .catch((error) => console.error("Error loading the file:", error));
  }, []);

  return (
    <div style={{justifyContent:"center"}}>
      <InternshipDetails
        title={details.title}
        pos={details.pos}
        description={details.description}
      />
    </div>
  );
};

export default ExporterInternship;