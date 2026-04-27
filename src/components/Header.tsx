import { useNavigate } from "react-router-dom";

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const navigate = useNavigate();
  return (
    <header className={`absolute top-0 left-0 right-0 z-10 p-6 ${className ?? ""}`}>
      <div className="flex justify-between items-center">
        <div className="text-white text-sm uppercase tracking-widest font-bold" style={{color: '#ff3b3b'}}>STRIKE ZONE</div>
        <nav className="flex gap-8">
          <a
            href="#modes"
            className="text-white hover:text-red-400 transition-colors duration-300 uppercase text-sm"
          >
            Режимы
          </a>
          <button
            onClick={() => navigate("/game")}
            className="text-white hover:text-red-400 transition-colors duration-300 uppercase text-sm border border-red-500 px-4 py-1 cursor-pointer"
          >
            Играть
          </button>
        </nav>
      </div>
    </header>
  );
}