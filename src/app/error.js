"use client";

import Link from "next/link";

export default function Error({ reset }) {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow flex items-center justify-center bg-zinc-100 min-h-[700px]">
        <div className="container mx-auto px-4 py-20 flex flex-col items-center text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-red-600">Oops!</h1>
          <h2 className="text-2xl md:text-3xl font-semibold mb-4 text-black">Ocorreu um erro</h2>

          <p className="text-lg mb-8 max-w-2xl mx-auto text-gray-700">
            Desculpe, ocorreu um erro inesperado. Nossa equipe já foi notificada e estamos
            trabalhando para resolver o problema.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button
              onClick={() => reset()}
              className="bg-[#8B6F4B] text-white py-3 px-8 rounded-md hover:bg-[#6B543B] transition-colors duration-300 uppercase tracking-wider font-bold text-sm"
            >
              Tentar novamente
            </button>

            <Link
              href="/"
              className="bg-black text-white py-3 px-8 rounded-md hover:bg-gray-800 transition-colors duration-300 uppercase tracking-wider font-bold text-sm"
            >
              Voltar para a Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
