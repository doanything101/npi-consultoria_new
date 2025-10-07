// src/app/busca/components/map-overlay.jsx
"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

// Usar o novo componente Google Maps integrado
const IntegratedMapWithNoSSR = dynamic(() => import("./integrated-map-component"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
        <p className="mt-2 text-gray-700 text-sm">Carregando mapa…</p>
      </div>
    </div>
  ),
});

export default function MapOverlay({
  open,
  onClose,
  filtros,
  imoveis = [],
  onPropertySelect,
  onClusterSelect,
  selectedCluster,
  selectedProperty,
  onClearSelection,
}) {
  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="md:hidden fixed inset-0 z-[9999] transition-transform duration-300 translate-y-0"
      aria-hidden={!open}
      role="dialog"
      aria-modal={open ? "true" : "false"}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* painel */}
      <div className="absolute inset-x-0 bottom-0 top-0 bg-white rounded-t-2xl overflow-hidden flex flex-col">
        {/* header */}
        <div className="shrink-0 px-4 py-3 flex items-center justify-center border-b relative">
          <h3 className="text-sm font-bold">Mapa</h3>
          {/* Contador superior central */}
          {selectedCluster && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-1 rounded-full bg-black/80 text-white text-[11px] font-semibold shadow-lg">
              {selectedCluster.length} imóveis selecionados
            </div>
          )}
        </div>

        {/* mapa ocupa todo o restante */}
        <div className="relative grow">
          {(() => {
            const selectionCount = selectedCluster?.length
              || (selectedProperty ? 1 : 0)
              || (Array.isArray(imoveis) ? imoveis.length : 0);

            if (!selectionCount) return null;

            return (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black/80 text-white text-xs font-semibold shadow-lg">
                {selectionCount} imóvel{selectionCount === 1 ? "" : "is"} selecionado
              </div>
            );
          })()}

          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none px-6 pb-5">
            <div className="pointer-events-auto flex justify-center">
              <button
                onClick={() => {
                  onClearSelection?.();
                  onClose();
                }}
                className="px-6 py-3 rounded-full bg-black text-white text-sm font-semibold shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
              >
                Ver resultados
              </button>
            </div>
          </div>

          <IntegratedMapWithNoSSR
            filtros={filtros}
            imoveis={imoveis}
            onPropertySelect={(property) => {
              console.log("🏠 Mobile - Propriedade selecionada:", property);
              onPropertySelect?.(property);
            }}
            onClusterSelect={(cluster) => {
              console.log("🔍 Mobile - Cluster selecionado:", cluster);
              onClusterSelect?.(cluster);
            }}
            selectedCluster={selectedCluster}
            selectedProperty={selectedProperty}
            onClearSelection={onClearSelection}
          />
        </div>
      </div>
    </div>
  );
}
