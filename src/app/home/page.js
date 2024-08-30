import Image from "next/image";
import MyAnimation from "@/components/Title/framer_title";
import Navbar from "@/components/Navbar/navbar";
import InternshipDetails from "@/components/Internship/internship";
import ExporterInternship from "@/components/Internship/exporter";
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
    <Navbar></Navbar>
      <MyAnimation></MyAnimation>
      <ExporterInternship></ExporterInternship>
    </main>
  );
}
