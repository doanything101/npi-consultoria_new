//D:\Downloads\npi-consultoria\src\app\busca\page.js
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import CardImovel, { CardImovelSkeleton } from "../components/ui/card-imovel";
import Pagination from "../components/ui/pagination";
import { Footer } from "../components/ui/footer";
import PropertyFilters from "./components/property-filters";
import { InputSearch } from "./components/InputSearch";

import { getImoveis, searchImoveis } from "../services";
import useFiltersStore from "../store/filtrosStore";
import useFavoritosStore from "../store/favoritosStore";
import useImovelStore from "../store/imovelStore";
import { gerarUrlSeoFriendly } from "../utils/url-slugs";

// --- NOVO COMPONENTE GOOGLE MAPS ---
import MapOverlay from "./components/map-overlay.jsx";

// Importar o novo componente Google Maps integrado
const IntegratedMapWithNoSSR = dynamic(() => import("./components/integrated-map-component"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black" />
        <p className="mt-2 text-gray-700">Carregando mapa...</p>
      </div>
    </div>
  ),
});

const SORTING_RULES = {
  relevancia: { sortField: "date", sortOrder: "desc" },
  maior_valor: { sortField: "price", sortOrder: "desc" },
  menor_valor: { sortField: "price", sortOrder: "asc" },
  maior_area: { sortField: "area", sortOrder: "desc" },
  menor_area: { sortField: "area", sortOrder: "asc" },
};

const PAGE_CACHE_DURATION = 300_000; // 5 minutos

/* =========================================================
   PÁGINA
========================================================= */
export default function BuscaImoveis() {
  const router = useRouter();

  // Dados & Stores
  const [imoveis, setImoveis] = useState([]);
  const [filteredImoveis, setFilteredImoveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchingData, setFetchingData] = useState(false);

  const filtrosAtuais = useFiltersStore((state) => state);
  const filtrosAplicados = useFiltersStore((state) => state.filtrosAplicados);
  const atualizacoesFiltros = useFiltersStore((state) => state.atualizacoesFiltros);

  const { favoritos, getQuantidadeFavoritos } = useFavoritosStore();
  const quantidadeFavoritos = getQuantidadeFavoritos();

  const adicionarVariosImoveisCache = useImovelStore(
    (state) => state.adicionarVariosImoveisCache
  );

  // UI / paginação
  const [ordenacao, setOrdenacao] = useState("relevancia");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 12,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [mostrandoFavoritos, setMostrandoFavoritos] = useState(false);

  // Mobile overlay states
  const [mapOpenMobile, setMapOpenMobile] = useState(false);
  const [filtersMobileOpen, setFiltersMobileOpen] = useState(false);

  const [isBrowser, setIsBrowser] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Estados para integração com o mapa
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [isMapFilterActive, setIsMapFilterActive] = useState(false);
  const lastFetchParams = useRef(null);
  const pageDataCacheRef = useRef(new Map());
  const desktopScrollRef = useRef(null);
  const mobileScrollRef = useRef(null);

  const effectiveImoveis = useMemo(() => {
    if (!isMapFilterActive) return imoveis;
    if (!Array.isArray(filteredImoveis) || filteredImoveis.length === 0) return imoveis;
    return filteredImoveis;
  }, [filteredImoveis, imoveis, isMapFilterActive]);

  const effectivePagination = useMemo(() => {
    const itemsPerPage = pagination.itemsPerPage || pagination.limit || 12;
    const basePagination = {
      ...pagination,
      itemsPerPage,
      limit: itemsPerPage,
      currentPage,
    };

    if (!isMapFilterActive) {
      return basePagination;
    }

    const totalItems = Array.isArray(filteredImoveis) ? filteredImoveis.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const safeCurrentPage = Math.min(basePagination.currentPage, totalPages);

    return {
      ...basePagination,
      totalItems,
      totalPages,
      currentPage: safeCurrentPage,
    };
  }, [currentPage, filteredImoveis, isMapFilterActive, pagination]);

  const clearMapSelection = useCallback(() => {
    setFilteredImoveis([]);
    setIsMapFilterActive(false);
    setSelectedCluster(null);
    setSelectedProperty(null);
  }, []);

  const scrollToResultsTop = useCallback(() => {
    if (typeof window === "undefined") return;

    const mobileNode = mobileScrollRef.current;
    const desktopNode = desktopScrollRef.current;

    if (mobileNode && mobileNode.offsetParent !== null) {
      mobileNode.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => {
        if (mobileScrollRef.current) {
          mobileScrollRef.current.scrollTop = 0;
        }
      }, 100);
      return;
    }

    if (desktopNode && desktopNode.offsetParent !== null) {
      desktopNode.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => {
        if (desktopScrollRef.current) {
          desktopScrollRef.current.scrollTop = 0;
        }
      }, 100);
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 100);
  }, []);

  const mapPropertiesToImoveis = useCallback(
    (properties) => {
      if (!Array.isArray(properties) || properties.length === 0) return [];

      const ids = new Set();
      properties.forEach((property) => {
        [property?.Codigo, property?._id, property?.id, property?.IdImovel]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .forEach((value) => ids.add(String(value)));
      });

      const matches = imoveis.filter((imovel) =>
        [imovel?.Codigo, imovel?._id, imovel?.id, imovel?.IdImovel]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .some((value) => ids.has(String(value)))
      );

      if (matches.length === 0) {
        return properties.filter((item) =>
          [item?.Codigo, item?._id, item?.id, item?.IdImovel]
            .some((value) => value !== undefined && value !== null && value !== "")
        );
      }

      return matches;
    },
    [imoveis]
  );

  const handlePropertySelect = useCallback(
    (property) => {
      if (!property) {
        clearMapSelection();
        return;
      }

      const normalized = mapPropertiesToImoveis([property]);
      const result = normalized.length > 0 ? normalized : [property];

      setSelectedCluster(null);
      setSelectedProperty(result[0] ?? null);
      setFilteredImoveis(result);
      setIsMapFilterActive(true);
    },
    [clearMapSelection, mapPropertiesToImoveis]
  );

  const handleClusterSelect = useCallback(
    (properties) => {
      if (!Array.isArray(properties) || properties.length === 0) {
        clearMapSelection();
        return;
      }

      const normalized = mapPropertiesToImoveis(properties);
      const result = normalized.length > 0 ? normalized : properties;

      setSelectedProperty(null);
      setSelectedCluster(result);
      setFilteredImoveis(result);
      setIsMapFilterActive(true);
    },
    [clearMapSelection, mapPropertiesToImoveis]
  );

  /* ================= META + STRUCTURED DATA ================= */
  const updateStructuredData = (totalItems = 0, imoveisData = []) => {
    if (typeof document === "undefined") return;
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://npiconsultoria.com.br";
    const currentDate = new Date().toISOString();

    let script = document.querySelector('script[type="application/ld+json"]');
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SearchResultsPage",
          "@id": `${baseUrl}/busca#webpage`,
          url:
            typeof window !== "undefined"
              ? window.location.href
              : `${baseUrl}/busca`,
          name: document.title,
          datePublished: currentDate,
          dateModified: currentDate,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: totalItems,
            itemListElement: imoveisData.slice(0, 10).map((imovel, index) => ({
              "@type": "ListItem",
              position: index + 1,
              item: {
                "@type": "RealEstateAgent",
                name: imovel.NomeImovel || `Imóvel ${imovel.Codigo}`,
                url: `${baseUrl}/imovel/${imovel.Codigo}`,
                image:
                  imovel.Foto1 || `${baseUrl}/assets/default-property.jpg`,
                offers: {
                  "@type": "Offer",
                  price: imovel.ValorNumerico || 0,
                  priceCurrency: "BRL",
                  availability: "https://schema.org/InStock",
                },
                address: {
                  "@type": "PostalAddress",
                  addressLocality: imovel.Cidade || "São Paulo",
                  addressRegion: "SP",
                  addressCountry: "BR",
                },
              },
            })),
          },
        },
      ],
    };

    script.textContent = JSON.stringify(structuredData);
  };

  const updateClientMetaTags = (quantidadeResultados = null) => {
    if (typeof window === "undefined") return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://npiconsultoria.com.br";
    const currentDate = new Date().toISOString();
    const fs = useFiltersStore.getState();

    const plural = {
      Apartamento: "Apartamentos",
      Casa: "Casas",
      "Casa Comercial": "Casas comerciais",
      "Casa em Condominio": "Casas em condomínio",
      Cobertura: "Coberturas",
      Flat: "Flats",
      Garden: "Gardens",
      Loft: "Lofts",
      Loja: "Lojas",
      "Prédio Comercial": "Prédios comerciais",
      "Sala Comercial": "Salas comerciais",
      Sobrado: "Sobrados",
      Terreno: "Terrenos",
    };

    const tParts = [];
    if (fs.categoriaSelecionada)
      tParts.push(plural[fs.categoriaSelecionada] || "Imóveis");
    else tParts.push("Imóveis");
    const finalidadeRotulo = obterRotuloFinalidade(fs.finalidade);
    if (finalidadeRotulo === "Comprar") tParts.push("a venda");
    else if (finalidadeRotulo === "Alugar") tParts.push("para aluguel");
    if (fs.cidadeSelecionada) tParts.push(`no ${fs.cidadeSelecionada}`);

    const qtd =
      quantidadeResultados !== null ? quantidadeResultados : pagination.totalItems;
    const title = `${tParts.join(" ")}${qtd ? ` ${qtd} imóveis` : ""}`.trim();
    const description = `Especialistas em ${tParts.join(" ")}. NPi`;

    document.title = title;

    const ensureMeta = (attr, value, isProp = false) => {
      const selector = isProp ? `meta[property="${attr}"]` : `meta[name="${attr}"]`;
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement("meta");
        if (isProp) tag.setAttribute("property", attr);
        else tag.setAttribute("name", attr);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", value);
    };

    ensureMeta("title", title);
    ensureMeta("description", description);
    ensureMeta("og:title", title, true);
    ensureMeta("og:description", description, true);
    ensureMeta("og:type", "website", true);
    ensureMeta("og:site_name", "NPi Imóveis", true);
    ensureMeta("og:updated_time", currentDate, true);

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    const canonicalUrl =
      (window?.location?.origin || baseUrl) +
      (window?.location?.pathname || "") +
      (window?.location?.search || "");
    canonicalLink.setAttribute("href", canonicalUrl);
  };

  const obterTokenFinalidade = (valor) => {
    if (!valor) return "";
    const normalizado = valor.toString().trim().toLowerCase();
    if (["comprar", "venda"].includes(normalizado)) return "venda";
    if (["alugar", "aluguel", "locacao", "locação"].includes(normalizado)) return "locacao";
    return "";
  };

  const obterRotuloFinalidade = (valor) => {
    const token = obterTokenFinalidade(valor);
    if (token === "locacao") return "Alugar";
    if (token === "venda") return "Comprar";
    return "";
  };

  /* ======================== URL / SEO HELPERS ======================== */
  const normalizarCidade = (cidade) => {
    if (!cidade) return null;
    const m = {
      guaruja: "Guarujá",
      "guarujá": "Guarujá",
      guaruja_: "Guarujá",
      "sao-paulo": "São Paulo",
      "sao_paulo": "São Paulo",
      "santo-andre": "Santo André",
      santos: "Santos",
      "praia-grande": "Praia Grande",
      bertioga: "Bertioga",
      mongagua: "Mongaguá",
      "mongaguá": "Mongaguá",
      ubatuba: "Ubatuba",
      caraguatatuba: "Caraguatatuba",
      "sao-sebastiao": "São Sebastião",
      ilhabela: "Ilhabela",
    };
    const k = cidade.toLowerCase();
    if (m[k]) return m[k];
    return cidade
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();
  };

  const extractFromSeoUrl = () => {
    if (typeof window === "undefined") return null;
    const path = window.location.pathname;
    const m = path.match(/\/buscar?\/([^/]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?/);
    if (!m) return null;

    const [, finalidade, categoria, cidade, bairro] = m;

    const finalidadeToken = obterTokenFinalidade(finalidade);
    const finalidadeStore = finalidadeToken === "locacao" ? "Alugar" : "Comprar";

    const singular = {
      apartamentos: "Apartamento",
      casas: "Casa",
      coberturas: "Cobertura",
      terrenos: "Terreno",
      flats: "Flat",
      gardens: "Garden",
      lofts: "Loft",
      lojas: "Loja",
      sobrados: "Sobrado",
    };
    const categoriaStore =
      singular[categoria.toLowerCase()] ||
      categoria.charAt(0).toUpperCase() + categoria.slice(1);

    return {
      finalidade: finalidadeStore,
      categoria: categoriaStore,
      cidade: normalizarCidade(cidade),
      bairro: bairro ? normalizarCidade(bairro) : null,
    };
  };

  const updateUrlFromFilters = () => {
    const s = useFiltersStore.getState();
    if (s.cidadeSelecionada && s.finalidade && s.categoriaSelecionada) {
      const url = gerarUrlSeoFriendly(s);
      // Garantir que só atualizamos URL se for válida e diferente da atual
      if (url && url !== '/busca' && typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== url) {
          router.replace(url);
        }
      } else if (url === '/busca') {
        // Se gerarUrlSeoFriendly retornou /busca, usar query params
        const params = new URLSearchParams();
        if (s.cidadeSelecionada) params.set("cidade", s.cidadeSelecionada);
        if (s.finalidade) params.set("finalidade", s.finalidade);
        if (s.categoriaSelecionada) params.set("categoria", s.categoriaSelecionada);
        if (s.bairrosSelecionados?.length)
          params.set("bairros", s.bairrosSelecionados.join(","));
        if (s.quartos) params.set("quartos", s.quartos);
        if (s.precoMin) params.set("precoMin", s.precoMin);
        if (s.precoMax) params.set("precoMax", s.precoMax);

        const newUrl = params.toString() ? `/busca?${params.toString()}` : "/busca";
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== newUrl) {
            router.replace(newUrl);
          }
        }
      }
    } else {
      // Filtros básicos incompletos - usar query params
      const params = new URLSearchParams();
      if (s.cidadeSelecionada) params.set("cidade", s.cidadeSelecionada);
      if (s.finalidade) params.set("finalidade", s.finalidade);
      if (s.categoriaSelecionada) params.set("categoria", s.categoriaSelecionada);
      if (s.bairrosSelecionados?.length)
        params.set("bairros", s.bairrosSelecionados.join(","));
      if (s.quartos) params.set("quartos", s.quartos);
      if (s.precoMin) params.set("precoMin", s.precoMin);
      if (s.precoMax) params.set("precoMax", s.precoMax);

      router.replace(params.toString() ? `/busca?${params.toString()}` : "/busca");
    }
  };

  /* ======================== BUSCA ======================== */

  const applyListingResult = (
    input,
    {
      pageToFetch = 1,
      pageOverride = null,
      registerCache = false,
    } = {}
  ) => {
    const listaImoveis = Array.isArray(input?.imoveis) ? input.imoveis : [];

    if (!isMapFilterActive) {
      clearMapSelection();
    }

    if (listaImoveis.length > 0) {
      setImoveis(listaImoveis);
      setFilteredImoveis((prev) => {
        if (isMapFilterActive && Array.isArray(prev) && prev.length > 0) {
          return prev;
        }
        return listaImoveis;
      });

      if (registerCache) {
        adicionarVariosImoveisCache(listaImoveis);
      }
    } else {
      setImoveis([]);
      if (!isMapFilterActive) {
        setFilteredImoveis([]);
      }
    }

    let paginationToUse;
    if (input && input.pagination) {
      const itemsPerPage =
        Number(input.pagination.itemsPerPage || input.pagination.limit) || 12;
      paginationToUse = {
        totalItems:
          Number(input.pagination.totalItems) ||
          (Array.isArray(listaImoveis) ? listaImoveis.length : 0),
        totalPages: Number(input.pagination.totalPages) || 1,
        currentPage:
          Number(input.pagination.currentPage) || pageToFetch,
        itemsPerPage,
        limit: itemsPerPage,
      };
    } else {
      const totalLocal = Array.isArray(listaImoveis) ? listaImoveis.length : 0;
      paginationToUse = {
        totalItems: totalLocal,
        totalPages: Math.max(1, Math.ceil(totalLocal / 12)),
        currentPage: pageToFetch,
        itemsPerPage: 12,
        limit: 12,
      };
    }

    setPagination(paginationToUse);

    if (pageOverride !== null) {
      setCurrentPage(paginationToUse.currentPage || pageToFetch);
    }

    const totalItemsMeta = paginationToUse.totalItems ?? listaImoveis.length;
    updateStructuredData(totalItemsMeta, listaImoveis);
    setTimeout(() => updateClientMetaTags(totalItemsMeta), 50);

    return {
      imoveis: listaImoveis,
      pagination: paginationToUse,
    };
  };

  const buildPriceParams = (isRent, min, max) => {
    const out = {};
    const hasMin = min !== null && min !== undefined && min !== "" && Number(min) > 0;
    const hasMax = max !== null && max !== undefined && max !== "" && Number(max) > 0;

    if (!hasMin && !hasMax) return out;

    if (isRent) {
      if (hasMin) {
        out.precoAluguelMin = String(min);
        out.valorAluguelMin = String(min);
        out.aluguelMin = String(min);
        out.precoMinimo = String(min);
      }
      if (hasMax) {
        out.precoAluguelMax = String(max);
        out.valorAluguelMax = String(max);
        out.aluguelMax = String(max);
        out.precoMaximo = String(max);
      }
    } else {
      if (hasMin) {
        out.precoMinimo = String(min);
        out.precoMin = String(min);
        out.valorMin = String(min);
      }
      if (hasMax) {
        out.precoMaximo = String(max);
        out.precoMax = String(max);
        out.valorMax = String(max);
      }
    }
    return out;
  };

  const buscarImoveis = async (
    comFiltros = false,
    {
      page: pageOverride = null,
      ordenacao: ordenacaoPersonalizada = null,
    } = {}
  ) => {
    if (mostrandoFavoritos) return;

    const pageToFetch = pageOverride ?? currentPage;
    const ordenacaoAtual = ordenacaoPersonalizada || ordenacao;
    const filtrosStore = comFiltros ? useFiltersStore.getState() : null;

    const filtroSnapshot = comFiltros
      ? {
          categoria: filtrosStore?.categoriaSelecionada || null,
          cidade: filtrosStore?.cidadeSelecionada || null,
          bairros: Array.isArray(filtrosStore?.bairrosSelecionados)
            ? [...filtrosStore.bairrosSelecionados]
            : [],
          finalidade: filtrosStore?.finalidade || null,
          quartos: filtrosStore?.quartos || null,
          banheiros: filtrosStore?.banheiros || null,
          vagas: filtrosStore?.vagas || null,
          precoMin: filtrosStore?.precoMin || null,
          precoMax: filtrosStore?.precoMax || null,
          areaMin: filtrosStore?.areaMin || null,
          areaMax: filtrosStore?.areaMax || null,
          abaixoMercado: Boolean(filtrosStore?.abaixoMercado),
          proximoMetro: Boolean(filtrosStore?.proximoMetro),
        }
      : null;

    const requestKey = JSON.stringify({
      comFiltros,
      page: pageToFetch,
      ordenacao: ordenacaoAtual,
      filtros: filtroSnapshot,
    });

    const cachedEntry = pageDataCacheRef.current.get(requestKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < PAGE_CACHE_DURATION) {
      applyListingResult(cachedEntry.payload, {
        pageToFetch,
        pageOverride,
        registerCache: false,
      });
      setIsLoading(false);
      setFetchingData(false);
      lastFetchParams.current = null;
      return;
    }

    if (fetchingData || lastFetchParams.current === requestKey) {
      return;
    }

    lastFetchParams.current = requestKey;
    setFetchingData(true);
    setIsLoading(true);

    try {
      let params = {};
      if (comFiltros && filtrosStore) {
        const finalidadeToken = obterTokenFinalidade(filtrosStore.finalidade || "");
        const isRent = finalidadeToken === "locacao";

        params = {
          categoria: filtrosStore.categoriaSelecionada || undefined,
          cidade: filtrosStore.cidadeSelecionada || undefined,
          quartos: filtrosStore.quartos || undefined,
          banheiros: filtrosStore.banheiros || undefined,
          vagas: filtrosStore.vagas || undefined,
        };

        if (
          Array.isArray(filtrosStore.bairrosSelecionados) &&
          filtrosStore.bairrosSelecionados.length > 0
        ) {
          params.bairrosArray = filtrosStore.bairrosSelecionados;
        }

        if (isRent) {
          params.finalidade = "locacao";
          params.status = "locacao";
          params.tipoNegocio = "locacao";
          params.negocio = "locacao";
          params.modalidade = "locacao";
        } else {
          params.finalidade = "venda";
          params.status = "venda";
          params.tipoNegocio = "venda";
        }

        Object.assign(params, buildPriceParams(isRent, filtrosStore.precoMin, filtrosStore.precoMax));

        if (filtrosStore.areaMin && filtrosStore.areaMin !== "0") {
          params.areaMinima = filtrosStore.areaMin;
        }
        if (filtrosStore.areaMax && filtrosStore.areaMax !== "0") {
          params.areaMaxima = filtrosStore.areaMax;
        }

        if (filtrosStore.abaixoMercado) params.apenasCondominios = true;
        if (filtrosStore.proximoMetro) params.proximoMetro = true;
      }

      const sortParams = SORTING_RULES[ordenacaoAtual] || SORTING_RULES.relevancia;
      const paramsComOrdenacao = {
        ...params,
        sortField: sortParams.sortField,
        sortOrder: sortParams.sortOrder,
      };

      const response = await getImoveis(paramsComOrdenacao, pageToFetch, 12);
      const processed = applyListingResult(response, {
        pageToFetch,
        pageOverride,
        registerCache: true,
      });

      pageDataCacheRef.current.set(requestKey, {
        timestamp: Date.now(),
        payload: processed,
      });
    } catch (error) {
      console.error("Erro ao buscar imóveis:", error);
      if (!isMapFilterActive) {
        clearMapSelection();
      }
      setImoveis([]);
      if (!isMapFilterActive) {
        setFilteredImoveis([]);
      }
      setPagination({
        totalItems: 0,
        totalPages: 1,
        currentPage: 1,
        itemsPerPage: 12,
        limit: 12,
      });
      updateStructuredData(0, []);
      lastFetchParams.current = null;
    } finally {
      setIsLoading(false);
      setFetchingData(false);
      lastFetchParams.current = null;
    }
  };

  /* ======================== INITIAL LOAD ======================== */
  useEffect(() => {
    if (!initialLoad) return;
    setIsBrowser(true);

    const seoParams = extractFromSeoUrl();

    const searchParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const cidade = searchParams.get("cidade");
    const finalidade = searchParams.get("finalidade");
    const categoria = searchParams.get("categoria");
    const bairros = searchParams.get("bairros");
    const quartos = searchParams.get("quartos");
    const precoMin = searchParams.get("precoMin");
    const precoMax = searchParams.get("precoMax");
    const searchQuery = searchParams.get("q");

    if (
      seoParams ||
      cidade ||
      finalidade ||
      categoria ||
      bairros ||
      quartos ||
      precoMin ||
      precoMax
    ) {
      const filtrosParaAplicar = {};
      if (seoParams) {
        filtrosParaAplicar.cidadeSelecionada = seoParams.cidade;
        filtrosParaAplicar.finalidade = seoParams.finalidade;
        filtrosParaAplicar.categoriaSelecionada = seoParams.categoria;
        if (seoParams.bairro) filtrosParaAplicar.bairrosSelecionados = [seoParams.bairro];
      } else {
        if (cidade) filtrosParaAplicar.cidadeSelecionada = normalizarCidade(cidade);
        if (finalidade) filtrosParaAplicar.finalidade = finalidade;
        if (categoria) filtrosParaAplicar.categoriaSelecionada = categoria;
        if (bairros) {
          const arr = bairros.split(",").map((b) => b.trim()).filter(Boolean);
          filtrosParaAplicar.bairrosSelecionados = arr;
        }
      }
      if (quartos) filtrosParaAplicar.quartos = parseInt(quartos);
      if (precoMin) filtrosParaAplicar.precoMin = parseFloat(precoMin);
      if (precoMax) filtrosParaAplicar.precoMax = parseFloat(precoMax);

      const store = useFiltersStore.getState();
      store.limparFiltros();
      setTimeout(() => {
        store.setFilters(filtrosParaAplicar);
        store.aplicarFiltros();
        setTimeout(() => {
          buscarImoveis(true);
          setInitialLoad(false);
        }, 80);
      }, 50);
    } else if (searchQuery) {
      setSearchTerm(searchQuery);
      setTimeout(() => {
        handleSearch(searchQuery);
        setInitialLoad(false);
      }, 60);
    } else {
      setTimeout(() => {
        buscarImoveis(false);
        setInitialLoad(false);
      }, 60);
    }

    setTimeout(() => updateClientMetaTags(), 300);
  }, [initialLoad]);

  useEffect(() => {
    if (initialLoad || !filtrosAplicados) return;
    clearMapSelection();
    setCurrentPage(1);
    buscarImoveis(true, { page: 1 });
  }, [filtrosAplicados, atualizacoesFiltros, initialLoad]);


  useEffect(() => {
    if (!isBrowser || initialLoad) return;
    const s = useFiltersStore.getState();
    if (s.filtrosAplicados) setTimeout(updateUrlFromFilters, 80);
  }, [atualizacoesFiltros, isBrowser, initialLoad]);

  useEffect(() => {
    if (isBrowser && !isLoading && pagination.totalItems >= 0) {
      setTimeout(() => updateClientMetaTags(pagination.totalItems), 80);
    }
  }, [isBrowser, isLoading, pagination.totalItems]);

  useEffect(() => {
    if (mapOpenMobile) {
      const prev = document.body.style.overflow;
      document.body.dataset.prevOverflow = prev || "";
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = document.body.dataset.prevOverflow || "";
      };
    }
  }, [mapOpenMobile]);

  const handlePageChange = (newPage) => {
    if (fetchingData) return;

    const clampedPage = isMapFilterActive
      ? Math.max(1, Math.min(newPage, effectivePagination.totalPages || 1))
      : newPage;

    if (clampedPage === currentPage) return;

    scrollToResultsTop();

    setCurrentPage(clampedPage);

    if (!isMapFilterActive && !mostrandoFavoritos) {
      const possuiFiltros = useFiltersStore.getState().filtrosAplicados;
      buscarImoveis(Boolean(possuiFiltros), { page: clampedPage });
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSearch = async (term) => {
    useFiltersStore.getState().limparFiltros();
    clearMapSelection();

    if (!term || term.trim() === "") {
      buscarImoveis(false);
      return;
    }

    setIsLoading(true);
    clearMapSelection();
    try {
      const response = await searchImoveis(term);
      if (response && response.data) {
        clearMapSelection();
        setImoveis(response.data);
        setFilteredImoveis(response.data);
        const p = {
          totalItems: response.data.length,
          totalPages: Math.ceil(response.data.length / 12),
          currentPage: 1,
          itemsPerPage: 12,
          limit: 12,
        };
        setPagination(p);
        if (Array.isArray(response.data) && response.data.length > 0) {
          adicionarVariosImoveisCache(response.data);
        }
        updateStructuredData(response.data.length, response.data);
        setTimeout(() => updateClientMetaTags(response.data.length), 50);
      } else {
        clearMapSelection();
        setImoveis([]);
        setFilteredImoveis([]);
        updateStructuredData(0, []);
      }
    } catch {
      clearMapSelection();
      setImoveis([]);
      setFilteredImoveis([]);
      updateStructuredData(0, []);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchTermChange = (term) => {
    setSearchTerm(term);
  };

  const handleSearchSubmit = (term) => {
    const trimmed = typeof term === "string" ? term.trim() : "";
    setSearchTerm(trimmed);
    handleSearch(trimmed);
  };

  const handleOrdenacaoChange = (valor) => {
    if (fetchingData) return;

    const proximaOrdenacao = SORTING_RULES[valor] ? valor : "relevancia";
    const possuiFiltros = useFiltersStore.getState().filtrosAplicados;

    if (proximaOrdenacao === ordenacao && currentPage === 1 && !isLoading) {
      return;
    }

    setOrdenacao(proximaOrdenacao);
    setCurrentPage(1);

    if (initialLoad) return;

    buscarImoveis(Boolean(possuiFiltros), {
      page: 1,
      ordenacao: proximaOrdenacao,
    });
  };

  const resetarEstadoBusca = () => {
    setSearchTerm("");
    setCurrentPage(1);
    if (mostrandoFavoritos) setMostrandoFavoritos(false);
    clearMapSelection();
  };

  const renderCards = () => {
    if (isLoading) {
      return Array(12)
        .fill(null)
        .map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="w-full sm:w-1/2 xl:w-[32%] min-w-0 flex-shrink-0"
          >
            <CardImovelSkeleton />
          </div>
        ));
    }

    if (Array.isArray(effectiveImoveis) && effectiveImoveis.length > 0) {
      const arr = [...effectiveImoveis];

      return arr.map((imovel) => {
        const key =
          imovel.Codigo || `imovel-${imovel._id || Math.random().toString(36).slice(2)}`;
        
        // Destacar o card se a propriedade está selecionada
        const isSelected = selectedProperty && 
          (selectedProperty.Codigo === imovel.Codigo || selectedProperty._id === imovel._id);
        
        return (
          <div 
            key={key} 
            className={`w-full sm:w-1/2 xl:w-[32%] min-w-0 flex-shrink-0 transition-all duration-200 ${
              isSelected ? 'ring-2 ring-blue-500 ring-opacity-50 scale-[1.02]' : ''
            }`}
          >
            <CardImovel {...imovel} target="_blank" />
          </div>
        );
      });
    }

    return <p className="text-center w-full py-8">Nenhum imóvel encontrado.</p>;
  };

  const construirTextoFiltros = () => {
    const s = useFiltersStore.getState();
    const qtd = effectivePagination.totalItems || 0;

    const plural = {
      Apartamento: "apartamentos",
      Casa: "casas",
      "Casa Comercial": "casas comerciais",
      "Casa em Condominio": "casas em condomínio",
      Cobertura: "coberturas",
      Flat: "flats",
      Garden: "gardens",
      Loft: "lofts",
      Loja: "lojas",
      "Prédio Comercial": "prédios comerciais",
      "Sala Comercial": "salas comerciais",
      Sobrado: "sobrados",
      Terreno: "terrenos",
    };

    let txt = `${qtd}`;
    if (s.categoriaSelecionada) {
      txt += ` ${plural[s.categoriaSelecionada] || "imóveis"}`;
    } else {
      txt += " imóveis";
    }

    const finalidadeRotulo = obterRotuloFinalidade(s.finalidade);
    if (finalidadeRotulo === "Comprar") {
      txt += " a venda";
    } else if (finalidadeRotulo === "Alugar") {
      txt += " para aluguel";
    }

    if (s.bairrosSelecionados?.length) {
      if (s.bairrosSelecionados.length === 1) {
        txt += ` em ${s.bairrosSelecionados[0]}`;
      } else if (s.bairrosSelecionados.length <= 3) {
        txt += ` em ${s.bairrosSelecionados.join(", ")}`;
      } else {
        txt += ` em ${s.bairrosSelecionados.slice(0, 2).join(", ")} e mais ${
          s.bairrosSelecionados.length - 2
        } bairros`;
      }
    } else if (s.cidadeSelecionada) {
      const c = s.cidadeSelecionada.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      txt += ` em ${c}`;
    }

    return txt;
  };

  /* ======================== RENDER ======================== */
  return (
    <>
      {/* DESKTOP (>= md): filtros horizontais fixos */}
      <div className="fixed top-20 left-0 w-full bg-white z-40 shadow-sm border-b px-4 md:px-10 hidden md:block overflow-x-auto">
        <PropertyFilters
          horizontal
          onFilter={resetarEstadoBusca}
          isVisible
          setIsVisible={() => {}}
          onMapSelectionClear={clearMapSelection}
          searchTerm={searchTerm}
          onSearchTermChange={handleSearchTermChange}
          onSearchSubmit={handleSearchSubmit}
          ordenacao={ordenacao}
          onOrdenacaoChange={handleOrdenacaoChange}
        />
      </div>

      {/* DESKTOP (>= md): layout 50/50 */}
      <div className="hidden md:flex fixed top-[10rem] left-0 w-full h-[calc(100vh-7rem)] overflow-hidden bg-zinc-100">
        {/* Cards */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center gap-2 p-4 border-b border-gray-200 bg-white">
            <div className="flex flex-col">
              <h2 className="text-xs font-bold text-zinc-500">
                {construirTextoFiltros()}
              </h2>
              {isMapFilterActive && (
                <div className="flex items-center justify-between text-xs text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded">
                  <span>
                    {(() => {
                      const count = filteredImoveis?.length ?? 0;
                      const suffix = count === 1 ? "" : "is";
                      const selectionText =
                        selectedCluster && count !== 1
                          ? " do cluster selecionado"
                          : " selecionado no mapa";

                      return `📍 Mostrando ${count} imóvel${suffix}${selectionText}`;
                    })()}
                  </span>
                  <button
                    onClick={clearMapSelection}
                    className="ml-2 text-red-500 hover:text-red-700 font-bold"
                  >
                    ✕ Mostrar todos
                  </button>
                </div>
              )}
            </div>
            <select
              className="text-xs font-bold text-zinc-500 bg-zinc-100 p-2 rounded-md"
              value={ordenacao}
              onChange={(e) => handleOrdenacaoChange(e.target.value)}
            >
              <option value="relevancia">Mais relevantes</option>
              <option value="maior_valor">Maior Valor</option>
              <option value="menor_valor">Menor Valor</option>
              <option value="maior_area">Maior Área</option>
              <option value="menor_area">Menor Área</option>
            </select>
          </div>

          <div ref={desktopScrollRef} className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <InputSearch
                value={searchTerm}
                onChange={handleSearchTermChange}
                onSubmit={handleSearchSubmit}
              />
            </div>
            <div className="flex flex-wrap gap-3 justify-center">{renderCards()}</div>
            <div className="mt-6 mb-6">
              <Pagination
                pagination={effectivePagination}
                onPageChange={handlePageChange}
              />
            </div>
            <div className="mt-12">
              <Footer />
            </div>
          </div>
        </div>

        {/* Google Maps */}
        <div className="w-1/2 relative h-full">
          <div className="absolute inset-0 right-0 h-full overflow-hidden">
            <IntegratedMapWithNoSSR
              filtros={filtrosAtuais}
              imoveis={imoveis}
              onPropertySelect={handlePropertySelect}
              onClusterSelect={handleClusterSelect}
              selectedCluster={selectedCluster}
              selectedProperty={selectedProperty}
              onClearSelection={clearMapSelection}
            />
          </div>
        </div>
      </div>

      {/* MOBILE (< md): barra ações + filtros off-canvas + lista */}
      <div className="md:hidden flex flex-col h-[100dvh] overflow-hidden bg-zinc-50">
        <div className="flex flex-col flex-1 min-h-0">
          <PropertyFilters
            horizontal={false}
            onFilter={resetarEstadoBusca}
            isVisible={filtersMobileOpen}
            setIsVisible={setFiltersMobileOpen}
            onMapSelectionClear={clearMapSelection}
            onOpenMap={() => setMapOpenMobile(true)}
            searchTerm={searchTerm}
            onSearchTermChange={handleSearchTermChange}
            onSearchSubmit={handleSearchSubmit}
            ordenacao={ordenacao}
            onOrdenacaoChange={handleOrdenacaoChange}
          />

          <div ref={mobileScrollRef} className="pt-2 pb-24 px-2 pt-1 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-white border">
            <span className="text-[11px] text-zinc-600 font-semibold">
              {effectivePagination.totalItems || 0} resultados
            </span>
            <select
              className="text-[12px] font-semibold text-zinc-600 bg-zinc-100 p-2 rounded-md"
              value={ordenacao}
              onChange={(e) => handleOrdenacaoChange(e.target.value)}
            >
              <option value="relevancia">Mais relevantes</option>
              <option value="maior_valor">Maior Valor</option>
              <option value="menor_valor">Menor Valor</option>
              <option value="maior_area">Maior Área</option>
              <option value="menor_area">Menor Área</option>
            </select>
          </div>

            <div className="mt-3 flex flex-col gap-6 pb-10">
              <div className="bg-white border border-gray-200 rounded-md px-3 py-3 shadow-sm md:hidden">
                <div className="flex flex-col gap-1">
                  <h2 className="text-[12px] font-bold text-zinc-600">
                    {construirTextoFiltros()}
                  </h2>
                  {isMapFilterActive && (
                    <div className="flex items-center justify-between text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      <span>
                        {(() => {
                          const count = filteredImoveis?.length ?? 0;
                          const suffix = count === 1 ? "" : "is";
                          const selectionText =
                            selectedCluster && count !== 1
                              ? " do cluster selecionado"
                              : " selecionado no mapa";

                          return `📍 Mostrando ${count} imóvel${suffix}${selectionText}`;
                        })()}
                      </span>
                      <button
                        onClick={clearMapSelection}
                        className="ml-2 text-red-500 hover:text-red-700 font-bold"
                      >
                        ✕ Mostrar todos
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 justify-center">{renderCards()}</div>

              <Pagination
                pagination={effectivePagination}
                onPageChange={handlePageChange}
              />

              <Footer />
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: overlay do mapa */}
      <MapOverlay
        open={mapOpenMobile}
        onClose={() => setMapOpenMobile(false)}
        filtros={filtrosAtuais}
        imoveis={imoveis}
        onPropertySelect={handlePropertySelect}
        onClusterSelect={handleClusterSelect}
        selectedCluster={selectedCluster}
        selectedProperty={selectedProperty}
        onClearSelection={clearMapSelection}
      />
    </>
  );
}
