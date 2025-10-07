// src/app/admin/imoveis/page.js

"use client";

import { useState, useEffect, useMemo } from "react";
import { getImovelById } from "@/app/services";
import AuthCheck from "../components/auth-check";
import { useRouter } from "next/navigation";
import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import useImovelStore from "../store/imovelStore";
import { getImoveisDashboard } from "../services/imoveis";
import FiltersImoveisAdmin from "./components/filters";
import { TrashIcon } from "lucide-react";
import ModalDelete from "../components/modal-delete";

// Função para calcular relevância do resultado
const calculateRelevance = (imovel, searchTerm) => {
  if (!searchTerm || !imovel) return 0;
  
  const term = searchTerm.toLowerCase().trim();
  let score = 0;
  
  const fields = [
    { field: imovel.Codigo?.toString().toLowerCase(), weight: 100 },
    { field: imovel.Empreendimento?.toLowerCase(), weight: 80 },
    { field: imovel.Endereco?.toLowerCase(), weight: 60 },
    { field: imovel.Bairro?.toLowerCase(), weight: 40 },
    { field: imovel.Cidade?.toLowerCase(), weight: 30 },
  ];
  
  fields.forEach(({ field, weight }) => {
    if (field) {
      if (field === term) {
        score += weight * 10;
      } else if (field.startsWith(term)) {
        score += weight * 5;
      } else if (field.includes(term)) {
        score += weight * 2;
      } else {
        const termWords = term.split(' ');
        const fieldWords = field.split(' ');
        
        termWords.forEach(termWord => {
          fieldWords.forEach(fieldWord => {
            if (fieldWord.includes(termWord) && termWord.length > 2) {
              score += weight * 0.5;
            }
          });
        });
      }
    }
  });
  
  return score;
};

const calcularDiasDesdeAtualizacao = (dataAtualizacao) => {
  if (!dataAtualizacao) return null;
  
  try {
    const dataAtual = new Date();
    const dataUpdate = new Date(dataAtualizacao);
    
    if (isNaN(dataUpdate.getTime())) return null;
    
    const diferencaMs = dataAtual - dataUpdate;
    const diferencaDias = Math.floor(diferencaMs / (1000 * 60 * 60 * 24));
    
    return diferencaDias;
  } catch (error) {
    console.error('Erro ao calcular dias desde atualização:', error);
    return null;
  }
};

const detectarCampoComData = (imovel) => {
  const camposPossiveis = [
    'DataHoraAtualizacao', 'updatedAt', 'DataAtualizacao', 'DataModificacao', 'DataUltimaAtualizacao',
    'lastModified', 'updated_at', 'data_atualizacao', 'dataAtualizacao',
    'UltimaAtualizacao', 'LastUpdate', 'ModifiedDate', 'UpdatedDate',
    'createdAt', 'created_at', 'DataCriacao', 'data_criacao', 'dataCriacao'
  ];

  for (const campo of camposPossiveis) {
    if (imovel[campo]) {
      const testDate = new Date(imovel[campo]);
      if (!isNaN(testDate.getTime())) {
        return imovel[campo];
      }
    }
  }

  return null;
};

const getStatusBadge = (imovel) => {
  const dataAtualizacao = detectarCampoComData(imovel);
  const diasDesdeAtualizacao = calcularDiasDesdeAtualizacao(dataAtualizacao);
  
  if (diasDesdeAtualizacao === null) {
    return {
      color: 'bg-gray-400',
      text: '?',
      title: 'Data de atualização não disponível'
    };
  }
  
  if (diasDesdeAtualizacao >= 120) {
    return {
      color: 'bg-black',
      text: '120+',
      title: `Atualizado há ${diasDesdeAtualizacao} dias (mais de 120 dias)`
    };
  } else if (diasDesdeAtualizacao >= 90) {
    return {
      color: 'bg-purple-500',
      text: '90+',
      title: `Atualizado há ${diasDesdeAtualizacao} dias (mais de 90 dias)`
    };
  } else if (diasDesdeAtualizacao >= 70) {
    return {
      color: 'bg-red-500',
      text: '70+',
      title: `Atualizado há ${diasDesdeAtualizacao} dias (mais de 70 dias)`
    };
  } else if (diasDesdeAtualizacao >= 50) {
    return {
      color: 'bg-yellow-500',
      text: '50+',
      title: `Atualizado há ${diasDesdeAtualizacao} dias (mais de 50 dias)`
    };
  } else {
    return {
      color: 'bg-green-500',
      text: 'OK',
      title: `Atualizado há ${diasDesdeAtualizacao} dias (recente)`
    };
  }
};

const sortByRelevance = (imoveis, searchTerm) => {
  if (!Array.isArray(imoveis)) return imoveis;
  
  return [...imoveis].sort((a, b) => {
    if (searchTerm) {
      const scoreA = calculateRelevance(a, searchTerm);
      const scoreB = calculateRelevance(b, searchTerm);
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
    }
    
    const dataA = detectarCampoComData(a);
    const dataB = detectarCampoComData(b);
    
    if (dataA && dataB) {
      const dateA = new Date(dataA);
      const dateB = new Date(dataB);
      
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB - dateA;
      }
    }
    
    if (dataA && !dataB) return -1;
    if (!dataA && dataB) return 1;
    
    const codigoA = parseInt(a.Codigo) || 0;
    const codigoB = parseInt(b.Codigo) || 0;
    return codigoA - codigoB;
  });
};

export default function AdminImoveis() {
  const router = useRouter();
  const [imoveis, setImoveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [codigoImovel, setCodigoImovel] = useState(null);
  const [isFilteringManually, setIsFilteringManually] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [sortType, setSortType] = useState('page');
  const [isLoadingFullData, setIsLoadingFullData] = useState(false);
  const [fullDataCache, setFullDataCache] = useState(null);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 50,
  });

  // Função para buscar todos os dados para ordenação completa
  const loadAllDataForSorting = async () => {
    setIsLoadingFullData(true);
    try {
      let allData = [];
      let currentPageLoad = 1;
      let hasMorePages = true;
      
      if (searchTerm) {
        while (hasMorePages) {
          const response = await fetch(`/api/search/admin?q=${encodeURIComponent(searchTerm)}&page=${currentPageLoad}&limit=50`);
          const data = await response.json();
          
          if (data && data.status === 200 && data.data && data.data.length > 0) {
            allData = [...allData, ...data.data];
            const totalPages = data.pagination?.totalPages || 1;
            hasMorePages = currentPageLoad < totalPages;
            currentPageLoad++;
          } else {
            hasMorePages = false;
          }
        }
      } else {
        const apiFilters = { ...filters };
        
        if (apiFilters.ValorMin) {
          apiFilters.ValorMin = apiFilters.ValorMin.toString();
        }
        if (apiFilters.ValorMax) {
          apiFilters.ValorMax = apiFilters.ValorMax.toString();
        }
        
        if (apiFilters.cadastro !== undefined) {
          apiFilters.Ativo = apiFilters.cadastro;
          delete apiFilters.cadastro;
        }
        
        while (hasMorePages) {
          const response = await getImoveisDashboard(apiFilters, currentPageLoad, 50);
          
          if (response && response.data && response.data.length > 0) {
            allData = [...allData, ...response.data];
            const totalPages = response.paginacao?.totalPages || Math.ceil((response.paginacao?.totalItems || response.paginacao?.total || 0) / 50) || 1;
            hasMorePages = currentPageLoad < totalPages;
            currentPageLoad++;
          } else {
            hasMorePages = false;
          }
        }
      }
      
      setFullDataCache(allData);
      return allData;
    } catch (error) {
      console.error('Erro ao carregar todos os dados:', error);
      alert('Erro ao carregar dados para ordenação completa');
      return null;
    } finally {
      setIsLoadingFullData(false);
    }
  };

  // Função para aplicar ordenação completa
  const applyFullSort = async (key, direction) => {
    let dataToSort = fullDataCache;
    
    if (!dataToSort || sortType !== 'full') {
      dataToSort = await loadAllDataForSorting();
      if (!dataToSort) return;
    }
    
    const sortedData = [...dataToSort].sort((a, b) => {
      let aValue, bValue;

      switch (key) {
        case 'codigo':
          aValue = parseInt(a.Codigo) || 0;
          bValue = parseInt(b.Codigo) || 0;
          break;
        case 'empreendimento':
          aValue = a.Empreendimento || '';
          bValue = b.Empreendimento || '';
          break;
        case 'bairro':
          aValue = a.BairroComercial || a.Bairro || '';
          bValue = b.BairroComercial || b.Bairro || '';
          break;
        case 'categoria':
          aValue = a.Categoria || '';
          bValue = b.Categoria || '';
          break;
        case 'area':
          aValue = parseFloat(String(a.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          bValue = parseFloat(String(b.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          break;
        case 'valor':
          const cleanA = String(a.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
          const cleanB = String(b.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
          aValue = parseFloat(cleanA) || 0;
          bValue = parseFloat(cleanB) || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const startIndex = (currentPage - 1) * 50;
    const endIndex = startIndex + 50;
    const paginatedData = sortedData.slice(startIndex, endIndex);
    
    setImoveis(paginatedData);
    setFullDataCache(sortedData);
    
    setPagination(prev => ({
      ...prev,
      totalItems: sortedData.length,
      totalPages: Math.ceil(sortedData.length / 50),
    }));
  };

  // Função para ordenar os imóveis
  const sortedImoveis = useMemo(() => {
    if (!sortConfig.key || !Array.isArray(imoveis)) return imoveis;

    return [...imoveis].sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case 'codigo':
          aValue = parseInt(a.Codigo) || 0;
          bValue = parseInt(b.Codigo) || 0;
          break;
        case 'empreendimento':
          aValue = a.Empreendimento || '';
          bValue = b.Empreendimento || '';
          break;
        case 'bairro':
          aValue = a.BairroComercial || a.Bairro || '';
          bValue = b.BairroComercial || b.Bairro || '';
          break;
        case 'categoria':
          aValue = a.Categoria || '';
          bValue = b.Categoria || '';
          break;
        case 'area':
          aValue = parseFloat(String(a.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          bValue = parseFloat(String(b.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          break;
        case 'valor':
          const cleanA = String(a.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
          const cleanB = String(b.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
          aValue = parseFloat(cleanA) || 0;
          bValue = parseFloat(cleanB) || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [imoveis, sortConfig]);

  // Função para exportar para Excel
  const exportToExcel = async () => {
    const confirmExport = window.confirm('Deseja exportar TODOS os imóveis do filtro atual? Isso pode levar alguns segundos para filtros com muitos resultados.');
    
    if (!confirmExport) return;
    
    setIsLoading(true);
    
    try {
      let allData = [];
      let currentPageExport = 1;
      let hasMorePages = true;
      
      if (searchTerm) {
        while (hasMorePages) {
          const response = await fetch(`/api/search/admin?q=${encodeURIComponent(searchTerm)}&page=${currentPageExport}&limit=50`);
          const data = await response.json();
          
          if (data && data.status === 200 && data.data && data.data.length > 0) {
            allData = [...allData, ...data.data];
            const totalPages = data.pagination?.totalPages || 1;
            hasMorePages = currentPageExport < totalPages;
            currentPageExport++;
          } else {
            hasMorePages = false;
          }
        }
      } 
      else if (Object.keys(filters).length > 0) {
        const apiFilters = { ...filters };
        
        if (apiFilters.ValorMin) {
          apiFilters.ValorMin = apiFilters.ValorMin.toString();
        }
        if (apiFilters.ValorMax) {
          apiFilters.ValorMax = apiFilters.ValorMax.toString();
        }
        
        if (apiFilters.cadastro !== undefined) {
          apiFilters.Ativo = apiFilters.cadastro;
          delete apiFilters.cadastro;
        }
        
        while (hasMorePages) {
          const response = await getImoveisDashboard(apiFilters, currentPageExport, 50);
          
          if (response && response.data && response.data.length > 0) {
            allData = [...allData, ...response.data];
            const totalPages = response.paginacao?.totalPages || Math.ceil((response.paginacao?.totalItems || response.paginacao?.total || 0) / 50) || 1;
            hasMorePages = currentPageExport < totalPages;
            currentPageExport++;
          } else {
            hasMorePages = false;
          }
        }
      }
      else {
        while (hasMorePages) {
          const response = await getImoveisDashboard({}, currentPageExport, 50);
          
          if (response && response.data && response.data.length > 0) {
            allData = [...allData, ...response.data];
            const totalPages = response.paginacao?.totalPages || Math.ceil((response.paginacao?.totalItems || response.paginacao?.total || 0) / 50) || 1;
            hasMorePages = currentPageExport < totalPages;
            currentPageExport++;
          } else {
            hasMorePages = false;
          }
        }
      }
      
      if (allData.length === 0) {
        alert('Não há dados para exportar');
        return;
      }
      
      if (sortConfig.key) {
        allData.sort((a, b) => {
          let aValue, bValue;

          switch (sortConfig.key) {
            case 'codigo':
              aValue = parseInt(a.Codigo) || 0;
              bValue = parseInt(b.Codigo) || 0;
              break;
            case 'empreendimento':
              aValue = a.Empreendimento || '';
              bValue = b.Empreendimento || '';
              break;
            case 'bairro':
              aValue = a.BairroComercial || a.Bairro || '';
              bValue = b.BairroComercial || b.Bairro || '';
              break;
            case 'categoria':
              aValue = a.Categoria || '';
              bValue = b.Categoria || '';
              break;
            case 'area':
              aValue = parseFloat(String(a.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
              bValue = parseFloat(String(b.AreaPrivativa || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
              break;
            case 'valor':
              const cleanA = String(a.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
              const cleanB = String(b.ValorAntigo || '0').replace(/\./g, '').replace(',', '.');
              aValue = parseFloat(cleanA) || 0;
              bValue = parseFloat(cleanB) || 0;
              break;
            default:
              return 0;
          }

          if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }

          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      const exportData = allData.map(imovel => {
        const statusImovel = verificarImovelAtivo(imovel);
        const dataAtualizacao = detectarCampoComData(imovel);
        const diasAtualizacao = calcularDiasDesdeAtualizacao(dataAtualizacao);
        
        return {
          'Código': imovel.Codigo || '-',
          'Ativo': statusImovel.texto,
          'Empreendimento': imovel.Empreendimento || '-',
          'Endereço': imovel.Endereco || '-',
          'Bairro': imovel.BairroComercial || imovel.Bairro || '-',
          'Cidade': imovel.Cidade || '-',
          'Estado': imovel.Estado || '-',
          'Categoria': imovel.Categoria || '-',
          'Status': imovel.Status || '-',
          'Situação': imovel.Situacao || '-',
          'Construtora': imovel.Construtora || '-',
          'Quartos': imovel.Quartos || '-',
          'Suítes': imovel.Suites || '-',
          'Banheiros': imovel.Banheiros || '-',
          'Vagas': imovel.Vagas || '-',
          'Área Privativa (m²)': imovel.AreaPrivativa || '-',
          'Área Total (m²)': imovel.AreaTotal || '-',
          'Valor': formatarValor(imovel.ValorAntigo),
          'Valor Condomínio': formatarValor(imovel.ValorCondominio),
          'IPTU': formatarValor(imovel.IPTU),
          'Dias desde Atualização': diasAtualizacao !== null ? diasAtualizacao : 'N/A',
          'Data Atualização': dataAtualizacao ? new Date(dataAtualizacao).toLocaleDateString('pt-BR') : 'N/A'
        };
      });

      const csvContent = convertToCSV(exportData);
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const now = new Date();
      const fileName = `imoveis_export_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}_total_${allData.length}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`Exportação concluída! Total de ${allData.length} imóveis exportados.`);
      
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar os dados. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const convertToCSV = (data) => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(';');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        let cell = row[header];
        if (typeof cell === 'string' && (cell.includes(';') || cell.includes('"') || cell.includes('\n'))) {
          cell = '"' + cell.replace(/"/g, '""') + '"';
        }
        return cell;
      }).join(';');
    });
    
    return csvHeaders + '\n' + csvRows.join('\n');
  };

  const saveSearchState = (term, results, paginationData) => {
    localStorage.setItem("admin_searchTerm", term);
    localStorage.setItem("admin_searchResults", JSON.stringify(results));
    localStorage.setItem("admin_searchPagination", JSON.stringify(paginationData));
  };

  const clearSearchState = () => {
    localStorage.removeItem("admin_searchTerm");
    localStorage.removeItem("admin_searchResults");
    localStorage.removeItem("admin_searchPagination");
  };

  const saveFiltersState = (appliedFilters, results, paginationData) => {
    localStorage.setItem("admin_appliedFilters", JSON.stringify(appliedFilters));
    localStorage.setItem("admin_filterResults", JSON.stringify(results));
    localStorage.setItem("admin_filterPagination", JSON.stringify(paginationData));
  };

  const clearFiltersState = () => {
    localStorage.removeItem("admin_appliedFilters");
    localStorage.removeItem("admin_filterResults");
    localStorage.removeItem("admin_filterPagination");
  };

  const getFiltersState = () => {
    const savedFilters = localStorage.getItem("admin_appliedFilters");
    const savedResults = localStorage.getItem("admin_filterResults");
    const savedPagination = localStorage.getItem("admin_filterPagination");
    
    if (savedFilters && savedResults && savedPagination) {
      return {
        filters: JSON.parse(savedFilters),
        results: JSON.parse(savedResults),
        pagination: JSON.parse(savedPagination)
      };
    }
    return null;
  };

  const loadImoveis = async (page = 1, search = "", customFilters = null) => {
    setIsLoading(true);
    try {
      let responseData;
      let newPaginationData;

      if (search) {
        const response = await fetch(`/api/search/admin?q=${encodeURIComponent(search)}&page=${page}&limit=50`);
        const data = await response.json();

        if (data && data.status === 200 && data.data) {
          responseData = data.data;
          newPaginationData = data.pagination;
          
          if (page === 1 && responseData.length > 1) {
            responseData = sortByRelevance(responseData, search);
          }
        } else {
          responseData = [];
          newPaginationData = {
            totalItems: 0,
            totalPages: 1,
            currentPage: 1,
            itemsPerPage: 50,
          };
        }

        saveSearchState(search, responseData, newPaginationData);
        clearFiltersState();

      } else {
        const filtersToUse = customFilters || filters;
        const apiFilters = { ...filtersToUse };
       
        if (apiFilters.ValorMin) {
          apiFilters.ValorMin = apiFilters.ValorMin.toString();
        }
        if (apiFilters.ValorMax) {
          apiFilters.ValorMax = apiFilters.ValorMax.toString();
        }

        if (apiFilters.cadastro !== undefined) {
          apiFilters.Ativo = apiFilters.cadastro;
          delete apiFilters.cadastro;
        }

        const response = await getImoveisDashboard(apiFilters, page, 50);
        
        if (response && response.data) {
          responseData = response.data;
          
          const paginacaoAPI = response.paginacao || {};
          newPaginationData = {
            totalItems: paginacaoAPI.totalItems || paginacaoAPI.total || responseData.length || 0,
            totalPages: paginacaoAPI.totalPages || Math.ceil((paginacaoAPI.totalItems || paginacaoAPI.total || responseData.length || 0) / 50),
            currentPage: page,
            itemsPerPage: 50,
          };
        } else {
          responseData = [];
          newPaginationData = {
            totalItems: 0,
            totalPages: 1,
            currentPage: 1,
            itemsPerPage: 50,
          };
        }

        if (responseData.length > 1) {
          responseData = sortByRelevance(responseData, "");
        }

        if (Object.keys(apiFilters).length > 0) {
          saveFiltersState(filtersToUse, responseData, newPaginationData);
        }

        clearSearchState();
      }

      setImoveis(responseData);
      setPagination(newPaginationData);

    } catch (error) {
      console.error("Erro ao carregar imóveis:", error);
      setImoveis([]);
      setPagination({
        totalItems: 0,
        totalPages: 1,
        currentPage: 1,
        itemsPerPage: 50,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedTerm = localStorage.getItem("admin_searchTerm");
    const savedResults = localStorage.getItem("admin_searchResults");
    const savedPagination = localStorage.getItem("admin_searchPagination");
    
    const savedFiltersState = getFiltersState();
    
    let initialPage = 1;
    let initialSearchTerm = "";
    let initialImoveis = [];
    let initialPagination = { totalItems: 0, totalPages: 1, currentPage: 1, itemsPerPage: 50 };

    if (savedTerm && savedResults && savedPagination) {
      initialSearchTerm = savedTerm;
      initialImoveis = JSON.parse(savedResults);
      initialPagination = JSON.parse(savedPagination);
      initialPage = initialPagination.currentPage || 1;

      setSearchTerm(initialSearchTerm);
      setImoveis(initialImoveis);
      setPagination(initialPagination);
      setIsLoading(true);
    } else if (savedFiltersState) {
      const initialFilters = savedFiltersState.filters;
      initialImoveis = savedFiltersState.results;
      initialPagination = savedFiltersState.pagination;
      initialPage = initialPagination.currentPage || 1;

      setFilters(initialFilters);
      setImoveis(initialImoveis);
      setPagination(initialPagination);
      setIsLoading(true);
    }
    
    loadImoveis(initialPage, initialSearchTerm);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFilteringManually) {
      setIsFilteringManually(false);
      return;
    }
    
    setFullDataCache(null);
    setSortType('page');
    
    if (sortType !== 'full' || !fullDataCache) {
      loadImoveis(currentPage, searchTerm, filters);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters, searchTerm]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    
    if (sortType === 'full' && fullDataCache && fullDataCache.length > 0) {
      const startIndex = (newPage - 1) * 50;
      const endIndex = startIndex + 50;
      const paginatedData = fullDataCache.slice(startIndex, endIndex);
      setImoveis(paginatedData);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadImoveis(1, searchTerm);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
    setFilters({});
    clearSearchState();
    clearFiltersState();
    loadImoveis(1, "");
  };

  const handleFilterApply = (newFilters) => {
    const processedFilters = { ...newFilters };

    Object.keys(processedFilters).forEach((key) => {
      if (Array.isArray(processedFilters[key]) && processedFilters[key].length === 0) {
        delete processedFilters[key];
      } else if (processedFilters[key] === "") {
        delete processedFilters[key];
      } else if (processedFilters[key] === null || processedFilters[key] === undefined) {
        delete processedFilters[key];
      }
    });

    setIsFilteringManually(true);
    setFilters(processedFilters);
    setCurrentPage(1);

    setSearchTerm("");
    clearSearchState();

    loadImoveis(1, "", processedFilters);
  };

  const handleEdit = async (imovelCodigo) => {
    setIsLoading(true);
    try {
      const response = await getImovelById(imovelCodigo);

      if (response && response.data) {
        const setImovelSelecionado = useImovelStore.getState().setImovelSelecionado;
        const imovelWithAutomacao = {
          ...response.data,
          Automacao: false,
        };
        setImovelSelecionado(imovelWithAutomacao);
        router.push("/admin/imoveis/gerenciar");
      } else {
        console.error("Erro ao buscar imóvel:", response?.error || "Imóvel não encontrado");
        alert("Erro ao buscar dados do imóvel. Tente novamente.");
      }
    } catch (error) {
      console.error("Erro ao editar imóvel:", error);
      alert("Ocorreu um erro ao buscar os dados do imóvel.");
    } finally {
      setIsLoading(false);
    }
  };

  const verificarImovelAtivo = (imovel) => {
    const ativoExplicito = imovel.Ativo?.toString().toLowerCase();
    const estaAtivo = ativoExplicito === "sim" || 
                      (ativoExplicito !== "não" && ativoExplicito !== "nao" && ativoExplicito !== "false");
    
    return {
      ativo: estaAtivo,
      texto: estaAtivo ? "Sim" : "Não"
    };
  };

  const formatarValor = (valor) => {
    if (valor === null || valor === undefined || valor === "") {
      return "-";
    }

    let valorNumerico;
    if (typeof valor === "number") {
      valorNumerico = valor;
    } else if (typeof valor === "string") {
      // Remove todos os pontos (separadores de milhares) e substitui vírgula por ponto
      // Mas primeiro verifica se é um formato com vírgula decimal (brasileiro)
      if (valor.includes(',')) {
        // Formato brasileiro: 3.250.000,00 ou 3250000,00
        const cleanedValue = valor.replace(/\./g, '').replace(',', '.');
        valorNumerico = parseFloat(cleanedValue);
      } else if (valor.includes('.')) {
        // Pode ser formato americano (3250000.00) ou brasileiro sem centavos (3.250.000)
        // Conta quantos pontos tem
        const pontos = (valor.match(/\./g) || []).length;
        if (pontos > 1) {
          // Múltiplos pontos = formato brasileiro (3.250.000)
          const cleanedValue = valor.replace(/\./g, '');
          valorNumerico = parseFloat(cleanedValue);
        } else {
          // Um ponto só = formato americano (3250000.00)
          valorNumerico = parseFloat(valor);
        }
      } else {
        // Sem pontos nem vírgulas
        valorNumerico = parseFloat(valor);
      }
    } else {
      return "-";
    }

    if (isNaN(valorNumerico)) {
      return "-";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(valorNumerico);
  };

  const formatarArea = (area) => {
    if (area === null || area === undefined || area === "") {
      return "-";
    }

    let areaNumerico;
    if (typeof area === "number") {
      areaNumerico = area;
    } else if (typeof area === "string") {
      const cleanedValue = area.replace(/[^\d.,]/g, '').replace(',', '.');
      areaNumerico = parseFloat(cleanedValue);
    } else {
      return "-";
    }

    if (isNaN(areaNumerico)) {
      return "-";
    }

    return `${Math.round(areaNumerico)} m²`;
  };

  const handleDelete = async (codigo) => {
    setCodigoImovel(codigo);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    loadImoveis(currentPage, searchTerm, filters);
  };

  const handleCadastrarNovoImovel = () => {
    const limparImovelSelecionado = useImovelStore.getState().limparImovelSelecionado;
    limparImovelSelecionado();
    router.push("/admin/imoveis/gerenciar");
  };

  const getPageNumbers = () => {
    const pages = [];
    const totalPages = pagination.totalPages;
    const currentPage = pagination.currentPage;
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <AuthCheck>
      <style jsx global>{`
        .admin-table-selectable * {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }

        .responsive-table-container {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .responsive-table {
          width: 100%;
          min-width: 900px;
        }

        @media (max-width: 1280px) {
          .responsive-table {
            min-width: 800px;
          }
          
          .responsive-table td,
          .responsive-table th {
            padding: 0.375rem 0.25rem;
            font-size: 0.75rem;
          }
        }

        @media (max-width: 768px) {
          .responsive-table {
            min-width: 700px;
          }
          
          .responsive-table td,
          .responsive-table th {
            padding: 0.25rem;
            font-size: 0.7rem;
          }
        }

        .responsive-table-container::-webkit-scrollbar {
          height: 8px;
        }

        .responsive-table-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }

        .responsive-table-container::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }

        .responsive-table-container::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

        .sticky-column {
          position: sticky;
          left: 0;
          z-index: 10;
          background-color: white;
          box-shadow: 2px 0 4px rgba(0,0,0,0.1);
        }

        .sticky-column-header {
          position: sticky;
          left: 0;
          z-index: 11;
          background-color: #f9fafb;
        }

        [class*="music"], [class*="play"], [class*="audio"], [class*="player"],
        [class*="sound"], [class*="media"], [class*="track"],
        button[style*="position: fixed"], 
        div[style*="position: fixed"][style*="bottom"], 
        div[style*="position: fixed"][style*="right"],
        .fixed.bottom-0, .fixed.bottom-1, .fixed.bottom-2, .fixed.bottom-3,
        .fixed.bottom-4, .fixed.bottom-5, .fixed.bottom-6, .fixed.bottom-8,
        .fixed.right-0, .fixed.right-1, .fixed.right-2, .fixed.right-3,
        .fixed.right-4, .fixed.right-5, .fixed.right-6, .fixed.right-8,
        button.fixed, div.fixed.right-4, div.fixed.bottom-4,
        [style*="z-index: 40"], [style*="z-index: 50"], [style*="z-index: 100"],
        [style*="z-index: 999"], [style*="z-index: 9999"],
        #music-player, #audio-player, #media-player,
        .music-player, .audio-player, .media-player,
        .floating-player, .sticky-player {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        audio, video[style*="display: none"] + *, 
        [data-testid*="player"], [data-testid*="music"], [data-testid*="audio"] {
          display: none !important;
        }
      `}</style>
      
      {isModalOpen && (
        <ModalDelete
          id={codigoImovel}
          title="Deletar Imóvel"
          description={`O imóvel com Código: ${codigoImovel} será deletado. Tem certeza que deseja continuar?`}
          buttonText="Deletar"
          link="/admin/imoveis"
          onClose={handleCloseModal}
          type="imovel"
        />
      )}
      
      <div className="admin-table-selectable w-full max-w-[100vw] px-2 sm:px-4 lg:px-6">
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gerenciamento de Imóveis</h1>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <select
                  onChange={async (e) => {
                    const [key, direction] = e.target.value.split('-');
                    if (key === 'none') {
                      setSortConfig({ key: null, direction: 'asc' });
                      setFullDataCache(null);
                      loadImoveis(currentPage, searchTerm, filters);
                    } else {
                      setSortConfig({ key, direction });
                      if (sortType === 'full') {
                        await applyFullSort(key, direction);
                      }
                    }
                  }}
                  value={sortConfig.key ? `${sortConfig.key}-${sortConfig.direction}` : 'none'}
                  disabled={isLoadingFullData}
                  className="text-[10px] sm:text-xs px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 font-bold rounded-md"
                >
                  <option value="none">📊 Ordenar por...</option>
                  <option value="codigo-asc">Código ↑</option>
                  <option value="codigo-desc">Código ↓</option>
                  <option value="empreendimento-asc">Empreendimento ↑</option>
                  <option value="empreendimento-desc">Empreendimento ↓</option>
                  <option value="valor-asc">Valor ↑</option>
                  <option value="valor-desc">Valor ↓</option>
                </select>
                
                <button
                  onClick={exportToExcel}
                  disabled={imoveis.length === 0}
                  className="text-[10px] sm:text-xs px-3 sm:px-5 py-1.5 sm:py-2 border font-bold rounded-md"
                >
                  📥 Excel
                </button>
                
                <button
                  onClick={handleCadastrarNovoImovel}
                  className="text-[10px] sm:text-xs px-3 sm:px-5 py-1.5 sm:py-2 border font-bold rounded-md text-white bg-black"
                >
                  + Novo Imóvel
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, endereço, cidade..."
                className="w-full text-xs rounded-md border border-gray-300 p-2"
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="submit"
                  className="flex-1 sm:flex-none px-4 py-2 text-[10px] font-bold rounded-md text-white bg-black"
                >
                  Busca Livre
                </button>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="flex-1 sm:flex-none px-4 py-2 text-[10px] font-bold rounded-md text-white bg-black"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div>
            <FiltersImoveisAdmin onFilter={handleFilterApply} />
          </div>

          {(Object.keys(filters).length > 0 || searchTerm) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-medium text-blue-900">
                    {pagination.totalItems || imoveis.length} imóveis encontrados
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (searchTerm) {
                      clearSearch();
                    } else {
                      setFilters({});
                      setCurrentPage(1);
                      clearFiltersState();
                      loadImoveis(1, "");
                    }
                  }}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Limpar {searchTerm ? 'busca' : 'filtros'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 sm:p-3 mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-medium text-gray-700">Status de Atualização:</span>
              <div className="flex flex-wrap gap-2 sm:gap-3 text-[8px] sm:text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-5 h-3 bg-green-500 rounded-sm"></div>
                  <span>OK</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-5 h-3 bg-yellow-500 rounded-sm"></div>
                  <span>50+</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-5 h-3 bg-red-500 rounded-sm"></div>
                  <span>70+</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-5 h-3 bg-purple-500 rounded-sm"></div>
                  <span>90+</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-5 h-3 bg-black rounded-sm"></div>
                  <span>120+</span>
                </div>
              </div>
            </div>
          </div>

          <div className="responsive-table-container shadow ring-1 ring-black ring-opacity-5 rounded-lg bg-white">
            <table className="responsive-table divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="sticky-column-header px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Código
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Ativo
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Empreendimento
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Bairro
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Categoria
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Área
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-left text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Valor
                  </th>
                  <th scope="col" className="px-1 sm:px-2 py-2 text-center text-[8px] sm:text-[9px] font-bold text-gray-900 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {isLoading ? (
                  Array(10)
                    .fill(null)
                    .map((_, index) => (
                      <tr key={`loading-${index}`}>
                        <td colSpan={8} className="px-3 py-3">
                          <div className="animate-pulse h-3 bg-gray-200 rounded"></div>
                        </td>
                      </tr>
                    ))
                ) : imoveis.length > 0 ? (
                  sortedImoveis.map((imovel) => {
                    const statusBadge = getStatusBadge(imovel);
                    
                    return (
                      <tr key={imovel.Codigo || imovel._id} className="hover:bg-gray-50">
                        <td className="sticky-column px-2 py-2 text-[9px] sm:text-[10px] font-bold text-gray-900">
                          <div className="flex items-center gap-1">
                            <span>{imovel.Codigo || "-"}</span>
                            <div 
                              className={`w-4 sm:w-5 h-3 ${statusBadge.color} rounded-sm flex items-center justify-center`}
                              title={statusBadge.title}
                            >
                              <span className="text-white text-[7px] sm:text-[8px] font-bold">
                                {statusBadge.text}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[8px] sm:text-[9px] text-gray-500">
                          {(() => {
                            const statusImovel = verificarImovelAtivo(imovel);
                            return (
                              <span
                                className={`inline-flex items-center rounded-full px-1 py-0.5 text-[8px] sm:text-[9px] font-medium ${
                                  statusImovel.ativo
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {statusImovel.texto}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] font-medium text-gray-900">
                          {imovel.Empreendimento || "-"}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] text-gray-600">
                          {imovel.BairroComercial || imovel.Bairro || "-"}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] text-gray-600">
                          {imovel.Categoria || "-"}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] text-gray-600">
                          {formatarArea(imovel.AreaPrivativa)}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] text-gray-600 whitespace-nowrap">
                          {formatarValor(imovel.ValorAntigo)}
                        </td>
                        <td className="px-1 sm:px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <a
                              href={`/imovel-${imovel.Codigo}/${imovel.Slug || 'detalhes'}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-900 p-0.5 sm:p-1 rounded hover:bg-gray-100"
                              title="Ver no site"
                            >
                              <EyeIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                            </a>
                            <button
                              className="text-indigo-600 hover:text-indigo-900 p-0.5 sm:p-1 rounded hover:bg-gray-100"
                              title="Editar"
                              onClick={() => handleEdit(imovel.Codigo)}
                            >
                              <PencilSquareIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                            </button>
                            <button
                              className="text-red-600 hover:text-red-900 p-0.5 sm:p-1 rounded hover:bg-gray-100"
                              title="Deletar"
                              onClick={() => handleDelete(imovel.Codigo)}
                            >
                              <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 sm:py-8 text-center text-xs text-gray-500">
                      Nenhum imóvel encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="mt-4 sm:mt-6 flex items-center justify-between border-t border-gray-200 bg-white px-2 sm:px-4 py-3">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage === 1}
                  className={`px-3 py-2 text-xs font-medium rounded-md ${
                    pagination.currentPage === 1
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Anterior
                </button>
                <span className="px-3 py-2 text-xs">
                  {pagination.currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className={`px-3 py-2 text-xs font-medium rounded-md ${
                    pagination.currentPage === pagination.totalPages
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Próximo
                </button>
              </div>
              
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-700">
                    Mostrando{' '}
                    <span className="font-medium">
                      {(pagination.currentPage - 1) * pagination.itemsPerPage + 1}
                    </span>{' '}
                    até{' '}
                    <span className="font-medium">
                      {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}
                    </span>{' '}
                    de{' '}
                    <span className="font-medium">{pagination.totalItems}</span> resultados
                  </p>
                </div>
                
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                      className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ${
                        pagination.currentPage === 1 ? 'cursor-not-allowed' : 'hover:text-gray-600'
                      }`}
                    >
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {getPageNumbers().map((pageNumber, index) => 
                      pageNumber === '...' ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="relative inline-flex items-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          className={`relative inline-flex items-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ${
                            pageNumber === pagination.currentPage
                              ? 'z-10 bg-black text-white'
                              : 'text-gray-900'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                      className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 ${
                        pagination.currentPage === pagination.totalPages ? 'cursor-not-allowed' : 'hover:text-gray-600'
                      }`}
                    >
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthCheck>
  );
}
