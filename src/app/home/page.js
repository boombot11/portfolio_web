
import MyAnimation from "@/components/Title/framer_title";
import Navbar from "@/components/Navbar/navbar";
import CircularAnimation from "@/components/Projects_box/project_box";
import Footer from "@/components/Footer/footer";
import ContactMe from "@/components/Contanct/contact";
import SplineComponent from "@/components/Spline/Exporter";
import ExporterInternship from "@/components/Internship/exporter";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
    <Navbar></Navbar>
      <MyAnimation></MyAnimation>
      <SplineComponent></SplineComponent>
      <ExporterInternship></ExporterInternship>
      <CircularAnimation></CircularAnimation>
      <ContactMe></ContactMe>
      <Footer></Footer>
    </main>
  );
}
