'use client'
import {motion } from "framer-motion"
import styles from './framer_title.css';
import Helper_sever from "../Spline/middle";

const MyAnimation = () => {

 

  return (
    <div className="TopWrap">
    <div
        className="wrapText"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0 }}
        style={{position:"relative", top:"50px"}}
      >
        Sahil Jadhav
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        style={{position:"relative", top:"30px"}}
      >
        Btech IT 2026
      </motion.p>
    </div>
    </div>
  )
}
export default MyAnimation