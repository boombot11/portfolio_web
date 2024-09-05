import Image from "next/image";
import MyAnimation from "@/components/Title/framer_title";
import Navbar from "@/components/Navbar/navbar";
import CircularAnimation from "@/components/Projects_box/project_box";
import Footer from "@/components/Footer/footer";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
    <Navbar></Navbar>
      <MyAnimation></MyAnimation>
      <CircularAnimation></CircularAnimation>
      <Footer></Footer>
    </main>
  );
}
