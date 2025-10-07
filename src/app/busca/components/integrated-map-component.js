// src/app/busca/components/integrated-map-component.js
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GoogleMapComponent from "./google-map-component";

export default function IntegratedMapComponent({
  filtros,
  imoveis: imoveisExternos = [],
  onPropertySelect,
  onClusterSelect,
  selectedCluster,
  selectedProperty,
  onClearSelection,
}) {
  const [mapImoveis, setMapImoveis] = useState([]);
  const [loading, setLoading] = useState(true);

  console.log("🗺️ IntegratedMapComponent recebeu filtros:", {
    filtrosAplicados: filtros?.filtrosAplicados,
    atualizacoesFiltros: filtros?.atualizacoesFiltros,
    filtros: filtros
  });
  const normalizarItemId = useCallback((item = {}) => {
    const candidatos = [item.Codigo, item._id, item.id, item.IdImovel]
      .map((valor) => (valor !== undefined && valor !== null ? String(valor) : ""))
      .filter(Boolean);

    if (candidatos.length > 0) return candidatos[0];

    const lat = item?.Latitude ?? item?.latitude;
    const lng = item?.Longitude ?? item?.longitude;
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      return `${lat}-${lng}`;
    }

    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }, []);

  const dadosDeduplicados = useMemo(() => {
    if (!Array.isArray(imoveisExternos)) return [];

    const mapa = new Map();

    imoveisExternos.forEach((item) => {
      const chave = normalizarItemId(item);
      if (!mapa.has(chave)) {
        mapa.set(chave, item);
      }
    });

    return Array.from(mapa.values());
  }, [imoveisExternos, normalizarItemId]);

  useEffect(() => {
    setLoading(true);

    const validos = dadosDeduplicados.filter((imovel) => {
      const lat = parseFloat(imovel?.Latitude ?? imovel?.latitude ?? "");
      const lng = parseFloat(imovel?.Longitude ?? imovel?.longitude ?? "");
      return !Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0;
    });

    setMapImoveis(validos);
    setLoading(false);
  }, [dadosDeduplicados]);

  const handlePropertyClick = useCallback(
    (imovel) => {
      console.log("🏠 Propriedade clicada:", imovel);
      onPropertySelect?.(imovel);
    },
    [onPropertySelect]
  );

  const handleClusterClick = useCallback(
    (properties) => {
      console.log("🔍 Cluster clicado com", properties.length, "propriedades:", properties);
      onClusterSelect?.(properties);
    },
    [onClusterSelect]
  );

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
          <p className="mt-2 text-gray-700">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <GoogleMapComponent
      imoveis={mapImoveis}
      onPropertyClick={handlePropertyClick}
      onClusterClick={handleClusterClick}
      selectedCluster={selectedCluster}
      selectedProperty={selectedProperty}
      onClearSelection={onClearSelection}
      center={mapImoveis.length > 0 ? undefined : { lat: -23.5505, lng: -46.6333 }}
      zoom={mapImoveis.length > 0 ? undefined : 11}
    />
  );
}