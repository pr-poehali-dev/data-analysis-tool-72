import { useScroll, useTransform, motion } from "framer-motion";
import { useRef } from "react";

export default function Hero() {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0vh", "50vh"]);

  return (
    <div
      ref={container}
      className="relative flex items-center justify-center h-screen overflow-hidden"
    >
      <motion.div
        style={{ y }}
        className="absolute inset-0 w-full h-full"
      >
        <img
          src="/images/mountain-landscape.jpg"
          alt="Mountain landscape"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <div className="absolute inset-0 bg-black/50 z-0" />
      <div className="relative z-10 text-center text-white px-6">
        <p className="text-xs uppercase tracking-[0.4em] mb-4 text-red-400 font-semibold">Тактический шутер</p>
        <h1 className="text-5xl md:text-7xl lg:text-9xl font-black tracking-tight mb-6 uppercase" style={{textShadow: '0 0 40px rgba(255,59,59,0.5)'}}>
          STRIKE<br/>ZONE
        </h1>
        <p className="text-base md:text-xl max-w-xl mx-auto opacity-80 mb-10">
          Быстрые матчи, реальные тактики. Стреляй первым — выживай дольше.
        </p>
        <a href="#play" className="inline-block bg-red-600 hover:bg-red-700 text-white uppercase tracking-widest text-sm px-8 py-3 transition-all duration-300 font-bold">
          Начать игру
        </a>
      </div>
    </div>
  );
}