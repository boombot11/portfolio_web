
import MyAnimation from "@/components/Title/framer_title";
import Navbar from "@/components/Navbar/navbar";
import CircularAnimation from "@/components/Projects_box/project_box";
import Footer from "@/components/Footer/footer";
import ContactMe from "@/components/Contanct/contact";
import SplineComponent from "@/components/Spline/Exporter";
import ExporterInternship from "@/components/Internship/exporter";
import './globals.css';


export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
    <Navbar />
    <section id="my-animation">
      <MyAnimation />
    </section>
    <section id="spline-component">
      <SplineComponent />
    </section>
    <section id="exporter-internship">
      <ExporterInternship />
    </section>
    <section id="circular-animation">
      <CircularAnimation />
    </section>
    <section id="contact-me">
      <ContactMe />
    </section>
    <Footer />
  </div>
  );
}
