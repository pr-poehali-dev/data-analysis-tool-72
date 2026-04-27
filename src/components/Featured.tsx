const modes = [
  { title: "1 на 1", desc: "Дуэль без права на ошибку. Один выстрел решает всё." },
  { title: "Команда vs Команда", desc: "5v5 тактические раунды. Координация — ключ к победе." },
  { title: "Выживание", desc: "Последний выживший забирает всё. Никакого возрождения." },
];

export default function Featured() {
  return (
    <div id="modes" className="flex flex-col lg:flex-row lg:justify-between lg:items-center min-h-screen px-6 py-12 lg:py-0 bg-neutral-950">
      <div className="flex-1 h-[400px] lg:h-[800px] mb-8 lg:mb-0 lg:order-2 relative">
        <img
          src="/images/mountain-landscape.jpg"
          alt="Game arena"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-neutral-950" />
      </div>
      <div className="flex-1 text-left lg:h-[800px] flex flex-col justify-center lg:mr-12 lg:order-1">
        <h3 className="uppercase mb-6 text-xs tracking-[0.3em] text-red-500 font-semibold">Режимы игры</h3>
        <p className="text-3xl lg:text-5xl mb-10 text-white leading-tight font-black uppercase">
          Выбери свою<br/>арену
        </p>
        <div className="flex flex-col gap-6 mb-10">
          {modes.map((m) => (
            <div key={m.title} className="border-l-2 border-red-600 pl-4">
              <h4 className="text-white font-bold text-lg uppercase tracking-wide mb-1">{m.title}</h4>
              <p className="text-neutral-400 text-sm">{m.desc}</p>
            </div>
          ))}
        </div>
        <button className="bg-red-600 text-white border border-red-600 px-6 py-3 text-sm transition-all duration-300 hover:bg-transparent hover:text-red-500 cursor-pointer w-fit uppercase tracking-widest font-bold">
          Играть сейчас
        </button>
      </div>
    </div>
  );
}