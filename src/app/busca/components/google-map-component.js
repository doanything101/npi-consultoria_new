// src/app/busca/components/google-map-component.js
"use client";

import { APIProvider, Map as GoogleMap, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import CustomMarker from "./custom-marker";
import { getImovelValorPrincipal, getImovelValorNumerico } from "@/app/utils/imovel-price";
import "./google-map-infowindow.css";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// Map ID é obrigatório para usar AdvancedMarker
// Configure NEXT_PUBLIC_GOOGLE_MAP_ID no .env.local ou use um ID temporário
const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 };
const DEFAULT_ZOOM = 11;

const getDistanceMeters = (pos1, pos2) => {
  const R = 6371e3;
  const φ1 = (pos1.lat * Math.PI) / 180;
  const φ2 = (pos2.lat * Math.PI) / 180;
  const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getClusterDistance = (zoom) => {
  if (zoom >= 15) return 0;
  if (zoom >= 13) return 80;
  if (zoom >= 11) return 150;
  return 300;
};

const getPropertyId = (imovel = {}) => {
  const candidates = [imovel.Codigo, imovel._id, imovel.id, imovel.IdImovel]
    .map((value) => (value !== undefined && value !== null ? String(value) : ""))
    .filter(Boolean);

  if (candidates.length > 0) return candidates[0];

  const lat = imovel?.Latitude ?? imovel?.latitude;
  const lng = imovel?.Longitude ?? imovel?.longitude;
  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    return `${lat}-${lng}`;
  }

  try {
    return JSON.stringify(imovel);
  } catch {
    return String(imovel);
  }
};

const formatPrecoTexto = (imovel) => {
  const valor = getImovelValorNumerico(imovel);
  if (!valor || Number.isNaN(valor)) return "Ver";
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `${(valor / 1_000).toFixed(0)}K`;
  return String(valor);
};

const clusterize = (items, zoom) => {
  const clusterDistance = getClusterDistance(zoom);
  const clusters = [];
  const processed = new Set();

  items.forEach((item, index) => {
    if (processed.has(index)) return;

    const clusterItems = [item];
    let latSum = item.position.lat;
    let lngSum = item.position.lng;
    processed.add(index);

    if (clusterDistance > 0) {
      items.forEach((otherItem, otherIndex) => {
        if (processed.has(otherIndex) || index === otherIndex) return;

        const distance = getDistanceMeters(item.position, otherItem.position);
        if (distance < clusterDistance) {
          clusterItems.push(otherItem);
          latSum += otherItem.position.lat;
          lngSum += otherItem.position.lng;
          processed.add(otherIndex);
        }
      });
    }

    const position = {
      lat: latSum / clusterItems.length,
      lng: lngSum / clusterItems.length,
    };

    clusters.push({
      id: clusterItems.map((clusterItem) => clusterItem.id).join("|"),
      position,
      items: clusterItems,
    });
  });

  return clusters;
};

const clusterMarkerStyle = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  backgroundColor: "#8B6F4B",
  color: "white",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  border: "4px solid white",
  fontFamily: "var(--font-michroma), Helvetica, sans-serif",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: "1",
  letterSpacing: "-0.02em",
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

function ClusterMarker({ count, active = false }) {
  const style = active
    ? {
        ...clusterMarkerStyle,
        transform: "scale(1.08)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.3)",
        borderColor: "#f8f5f0",
      }
    : clusterMarkerStyle;

  return <div style={style}>{count}</div>;
}

const ImovelPopup = ({ imovel, onClose }) => {
  const formatterSlug = (text) => {
    if (!text) return "";
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  };

  const slug = formatterSlug(imovel.Empreendimento || "");

  const getFotoDestaqueUrl = (item) => {
    if (!item.Foto || !Array.isArray(item.Foto) || item.Foto.length === 0) {
      if (item.FotoDestaque) return item.FotoDestaque;
      if (item.imagemDestaque) return item.imagemDestaque;
      if (item.FotoPrincipal) return item.FotoPrincipal;
      return "https://via.placeholder.com/300x200/E5E7EB/6B7280?text=Sem+foto";
    }

    const fotoDestaque = item.Foto.find(
      (foto) => foto && foto.Destaque === "Sim" && foto.Foto,
    );

    if (fotoDestaque && fotoDestaque.Foto) {
      return fotoDestaque.Foto;
    }

    const primeiraFoto = item.Foto.find(
      (foto) => foto && foto.Foto && typeof foto.Foto === "string" && foto.Foto.trim() !== "",
    );

    if (primeiraFoto && primeiraFoto.Foto) {
      return primeiraFoto.Foto;
    }

    return "https://via.placeholder.com/300x200/E5E7EB/6B7280?text=Sem+foto";
  };

  const fotoUrl = getFotoDestaqueUrl(imovel);
  const valorPrincipal = getImovelValorPrincipal(imovel);

  const getInfoExtra = () => {
    const infos = [];
    if (imovel.AreaPrivativa || imovel.AreaConstruida) {
      infos.push(`${imovel.AreaPrivativa || imovel.AreaConstruida} m²`);
    }
    const dormitorios = imovel.Dormitorios || imovel.Quartos;
    if (dormitorios) {
      infos.push(`${dormitorios} dorm.`);
    }
    const vagas = imovel.VagasAntigo || imovel.Vagas;
    if (vagas) {
      infos.push(`${vagas} vaga${vagas > 1 ? "s" : ""}`);
    }
    return infos.join(" • ");
  };

  const infoExtra = getInfoExtra();

  return (
    <div 
      className="bg-white rounded-lg shadow-lg relative"
      style={{
        width: '280px',
        maxWidth: 'calc(100vw - 40px)',
        padding: '12px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >

      <div 
        className="relative rounded-lg overflow-hidden mb-2 bg-gray-200"
        style={{
          width: '100%',
          height: '140px',
          maxWidth: '100%',
          flexShrink: 0,
        }}
      >
        <Image
          src={fotoUrl}
          alt={`Imóvel ${imovel.Empreendimento || imovel.Codigo}`}
          fill
          style={{ objectFit: "cover" }}
          sizes="(max-width: 768px) calc(100vw - 64px), 300px"
          priority={false}
        />
      </div>

      <h3
        className="font-bold text-base truncate mb-1"
        style={{ 
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          paddingRight: '8px',
        }}
        title={imovel.Empreendimento}
      >
        {imovel.Empreendimento || `Imóvel ${imovel.Codigo}`}
      </h3>

      <p
        className="text-sm text-gray-600 truncate mb-2"
        style={{ 
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
        title={imovel.BairroComercial || imovel.Bairro || imovel.Endereco}
      >
        {imovel.BairroComercial || imovel.Bairro || imovel.Endereco || "Localização"}
      </p>

      {infoExtra && (
        <p 
          className="text-xs text-gray-500 mb-2"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {infoExtra}
        </p>
      )}

      <p 
        className="text-base font-bold text-green-700 mb-2"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          fontSize: '15px',
        }}
      >
        {valorPrincipal}
      </p>

      <a
        href={`/imovel/${imovel.Codigo}/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="!no-underline block"
        style={{ width: '100%' }}
      >
        <button 
          className="bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
          style={{
            width: '100%',
            padding: '8px 16px',
            boxSizing: 'border-box',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Ver Detalhes
        </button>
      </a>
    </div>
  );
};

const MarkersLayer = ({
  imoveis,
  zoom,
  onPropertyClick,
  onClusterClick,
  onClearSelection,
  selectedProperty,
  selectedCluster,
}) => {
  const map = useMap();
  const [activeInfo, setActiveInfo] = useState(null);

  const selectedClusterIds = useMemo(() => {
    if (!Array.isArray(selectedCluster) || selectedCluster.length === 0) return new Set();
    return new Set(selectedCluster.map((item) => getPropertyId(item)));
  }, [selectedCluster]);

  const processedImoveis = useMemo(() => {
    return imoveis
      .map((imovel) => {
        const lat = parseFloat(imovel?.Latitude ?? imovel?.latitude ?? "");
        const lng = parseFloat(imovel?.Longitude ?? imovel?.longitude ?? "");
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        return {
          id: getPropertyId(imovel),
          imovel,
          position: { lat, lng },
          priceText: formatPrecoTexto(imovel),
        };
      })
      .filter(Boolean);
  }, [imoveis]);

  const clusters = useMemo(() => clusterize(processedImoveis, zoom), [processedImoveis, zoom]);

  const handleMarkerClick = useCallback(
    (item) => {
      onPropertyClick?.(item.imovel);
      setActiveInfo({ imovel: item.imovel, position: item.position });
    },
    [onPropertyClick],
  );

  const handleClusterClick = useCallback(
    (cluster) => {
      onClusterClick?.(cluster.items.map((clusterItem) => clusterItem.imovel));
      setActiveInfo(null);

      if (map && cluster.items.length > 1 && window?.google?.maps) {
        const bounds = new window.google.maps.LatLngBounds();
        cluster.items.forEach(({ position }) => bounds.extend(position));
        map.fitBounds(bounds, 60);
      }
    },
    [map, onClusterClick],
  );

  useEffect(() => {
    if (!selectedProperty) {
      setActiveInfo(null);
      return;
    }

    const selectedId = getPropertyId(selectedProperty);
    const matchingItem = processedImoveis.find((item) => item.id === selectedId);
    if (matchingItem) {
      setActiveInfo({ imovel: matchingItem.imovel, position: matchingItem.position });
      if (map && window?.google?.maps) {
        map.panTo(matchingItem.position);
      }
    }
  }, [selectedProperty, processedImoveis, map]);

  useEffect(() => {
    if (!selectedCluster || selectedCluster.length === 0 || !map || !window?.google?.maps) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    selectedCluster.forEach((item) => {
      const lat = parseFloat(item?.Latitude ?? item?.latitude ?? "");
      const lng = parseFloat(item?.Longitude ?? item?.longitude ?? "");
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        bounds.extend({ lat, lng });
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 60);
    }
  }, [selectedCluster, map]);

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.items.length > 1) {
          const isSelected = cluster.items.some((item) => selectedClusterIds.has(item.id));
          return (
            <AdvancedMarker
              key={cluster.id}
              position={cluster.position}
              onClick={() => handleClusterClick(cluster)}
            >
              <ClusterMarker count={cluster.items.length} active={isSelected} />
            </AdvancedMarker>
          );
        }

        const item = cluster.items[0];
        const isSelected = activeInfo?.imovel && getPropertyId(activeInfo.imovel) === item.id;

        return (
          <AdvancedMarker
            key={cluster.id}
            position={item.position}
            onClick={() => handleMarkerClick(item)}
          >
            <CustomMarker text={item.priceText} active={isSelected} />
          </AdvancedMarker>
        );
      })}

      {activeInfo ? (
        <InfoWindow
          position={activeInfo.position}
          onCloseClick={() => {
            setActiveInfo(null);
            onClearSelection?.();
          }}
          options={{
            maxWidth: 320,
            pixelOffset: { width: 0, height: 0 },
          }}
        >
          <ImovelPopup
            imovel={activeInfo.imovel}
            onClose={() => {
              setActiveInfo(null);
              onClearSelection?.();
            }}
          />
        </InfoWindow>
      ) : null}
    </>
  );
};

export default function GoogleMapComponent({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  imoveis = [],
  onPropertyClick,
  onClusterClick,
  onClearSelection,
  selectedCluster,
  selectedProperty,
  className,
}) {
  const [currentZoom, setCurrentZoom] = useState(zoom ?? DEFAULT_ZOOM);

  const handleCameraChanged = useCallback((event) => {
    if (event?.detail?.zoom !== undefined) {
      setCurrentZoom(event.detail.zoom);
    }
  }, []);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-4">
          <p className="text-sm text-gray-600 mb-2">
            Configure a variável NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para visualizar o mapa.
          </p>
          {!process.env.NEXT_PUBLIC_GOOGLE_MAP_ID && (
            <p className="text-xs text-amber-600">
              ⚠️ Defina também NEXT_PUBLIC_GOOGLE_MAP_ID no .env.local para usar marcadores avançados.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Aviso se Map ID não estiver configurado
  if (GOOGLE_MAP_ID === "DEMO_MAP_ID" && typeof window !== "undefined") {
    console.warn(
      "⚠️ Usando Map ID temporário. Configure NEXT_PUBLIC_GOOGLE_MAP_ID no .env.local para produção.\n" +
      "Instruções: https://console.cloud.google.com/google/maps-apis/studio/maps"
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} onLoad={() => console.log("✅ Google Maps carregado com APIProvider")}>
      <GoogleMap
        mapId={GOOGLE_MAP_ID}
        defaultCenter={center}
        defaultZoom={zoom ?? DEFAULT_ZOOM}
        style={{ width: "100%", height: "100%" }}
        className={className}
        disableDefaultUI
        gestureHandling="greedy"
        onCameraChanged={handleCameraChanged}
        onClick={() => {
          onClearSelection?.();
        }}
        options={{
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        }}
      >
        <MarkersLayer
          imoveis={imoveis}
          zoom={currentZoom}
          onPropertyClick={onPropertyClick}
          onClusterClick={onClusterClick}
          onClearSelection={onClearSelection}
          selectedCluster={selectedCluster}
          selectedProperty={selectedProperty}
        />
      </GoogleMap>
    </APIProvider>
  );
}