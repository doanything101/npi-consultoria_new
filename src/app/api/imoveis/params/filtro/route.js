import { connectToDatabase } from "@/app/lib/mongodb";
import Imovel from "@/app/models/Imovel";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const categoria = searchParams.get("categoria");
  const cidade = searchParams.get("cidade");
  const bairros = searchParams.getAll("bairros");
  const finalidade = searchParams.get("finalidade");
  const finalidadeToken = (finalidade || "").toLowerCase();
  const quartos = searchParams.get("quartos");
  const banheiros = searchParams.get("banheiros");
  const vagas = searchParams.get("vagas");
  const precoMinimo = searchParams.get("precoMinimo");
  const precoMaximo = searchParams.get("precoMaximo");
  const areaMinima = searchParams.get("areaMinima");
  const areaMaxima = searchParams.get("areaMaxima");

  const limit = parseInt(searchParams.get("limit") || "12", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const skip = (page - 1) * limit;

  const rawSortField = searchParams.get("sortField") || "date";
  const sortField = ["price", "area", "date"].includes(rawSortField)
    ? rawSortField
    : "date";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  const STATUS_INDISPONIVEIS = ["VENDIDO", "LOCADO", "ALUGADO"];
  const STATUS_INDISPONIVEIS_REGEX = /^(vendido|locado|alugado)$/i;

  try {
    await connectToDatabase();

    // Removido filtro de valores - buscar todos os imóveis
    const filtro = {
      Situacao: { $not: STATUS_INDISPONIVEIS_REGEX },
    };

    if (categoria) filtro.Categoria = categoria;
    if (cidade) filtro.Cidade = cidade;

    // Mapeamento correto: finalidade -> Status do banco
    const aluguelStatuses = ["ALUGUEL", "LOCAÇÃO", "LOCACAO", "Locação", "Locacao"];
    const statusMap = {
      comprar: ["VENDA"],
      venda: ["VENDA"],
      alugar: aluguelStatuses,
      aluguel: aluguelStatuses,
      locacao: aluguelStatuses,
      "locação": aluguelStatuses,
    };

    const statusFiltro = statusMap[finalidadeToken];
    if (statusFiltro) {
      filtro.Status = statusFiltro.length === 1 ? statusFiltro[0] : { $in: statusFiltro };
    } else {
      filtro.Status = { $nin: STATUS_INDISPONIVEIS };
    }

    if (bairros && bairros.length > 0) {
      // Função para normalizar nomes de bairros (capitalizar corretamente)
      const normalizarBairro = (bairro) => {
        // Palavras que devem ficar em minúscula (preposições, artigos, etc)
        const preposicoes = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'];

        return bairro
          .toLowerCase()
          .split(' ')
          .map((palavra, index) => {
            // Primeira palavra sempre maiúscula
            if (index === 0) {
              return palavra.charAt(0).toUpperCase() + palavra.slice(1);
            }
            // Preposições ficam em minúscula, exceto se for a primeira palavra
            if (preposicoes.includes(palavra)) {
              return palavra;
            }
            // Outras palavras ficam com primeira letra maiúscula
            return palavra.charAt(0).toUpperCase() + palavra.slice(1);
          })
          .join(' ')
          .trim();
      };

      // Normalizar os bairros para comparação
      const bairrosNormalizados = bairros.map(b => normalizarBairro(b.trim()));

      // Criar array com variações (original + normalizada) para máxima compatibilidade
      const bairrosParaBusca = [];
      bairros.forEach(bairro => {
        const original = bairro.trim();
        const normalizado = normalizarBairro(original);

        bairrosParaBusca.push(original);
        if (original !== normalizado) {
          bairrosParaBusca.push(normalizado);
        }

        // Adicionar também versão lowercase e uppercase para compatibilidade
        bairrosParaBusca.push(original.toLowerCase());
        bairrosParaBusca.push(original.toUpperCase());
      });

      // Remover duplicatas
      const bairrosUnicos = [...new Set(bairrosParaBusca)];

      // Usar $or para buscar em ambos os campos de bairro
      filtro.$or = [
        { BairroComercial: { $in: bairrosUnicos } },
        { Bairro: { $in: bairrosUnicos } }
      ];
    }

    if (quartos) {
      const quartosNum = parseInt(quartos);
      if (quartos === "4+") {
        filtro.$and = filtro.$and || [];
        filtro.$and.push({
          $or: [
            { Dormitorios: { $gte: 4 } },
            { DormitoriosAntigo: { $gte: 4 } }
          ]
        });
      } else {
        filtro.$and = filtro.$and || [];
        filtro.$and.push({
          $or: [
            { Dormitorios: quartosNum },
            { DormitoriosAntigo: quartosNum }
          ]
        });
      }
    }
    if (banheiros) {
      if (banheiros === "4+") filtro.BanheiroSocialQtd = { $gte: 4 };
      else filtro.BanheiroSocialQtd = parseInt(banheiros);
    }
    if (vagas) {
      const vagasNum = parseInt(vagas);
      if (vagas === "4+") {
        filtro.$and = filtro.$and || [];
        filtro.$and.push({
          $or: [
            { Vagas: { $gte: 4 } },
            { VagasAntigo: { $gte: 4 } }
          ]
        });
      } else {
        filtro.$and = filtro.$and || [];
        filtro.$and.push({
          $or: [
            { Vagas: vagasNum },
            { VagasAntigo: vagasNum }
          ]
        });
      }
    }

    // Função para converter string de preço para número
    const converterPrecoParaNumero = (valor) => {
      if (!valor) return 0;
      try {
        let valorStr = String(valor);
        // Remove símbolos de moeda e espaços
        valorStr = valorStr.replace(/[R$\s]/g, "");
        // Remove TODOS os pontos (separadores de milhares no formato brasileiro)
        valorStr = valorStr.replace(/\./g, "");
        // Converte vírgula para ponto (para decimais)
        valorStr = valorStr.replace(",", ".");
        return parseFloat(valorStr) || 0;
      } catch (error) {
        console.error(`Erro ao converter preço "${valor}":`, error);
        return 0;
      }
    };

    // Função para converter string de área para número
    const converterAreaParaNumero = (valor) => {
      if (!valor) return 0;
      try {
        let valorStr = String(valor);
        // Remove todas as variações de unidade de área
        valorStr = valorStr
          .replace(/\s*m²?\s*/gi, "")
          .replace(/m2/gi, "")
          .trim();
        // Converte vírgula para ponto (para decimais)
        valorStr = valorStr.replace(",", ".");
        // Remove outros caracteres não numéricos exceto ponto
        valorStr = valorStr.replace(/[^\d.]/g, "");
        return parseFloat(valorStr) || 0;
      } catch (error) {
        console.error(`Erro ao converter área "${valor}":`, error);
        return 0;
      }
    };

    const camposPrecoVenda = [
      "ValorAntigo",
      "ValorVenda",
      "ValorVenda2",
      "ValorVenda3",
      "ValorVenda4",
      "ValorCobertura",
      "ValorCobertura2",
      "ValorGarden",
      "ValorGarden2",
    ];

    const camposPrecoLocacao = [
      "ValorAluguelSite",
      "ValorLocacao",
      "ValorAluguel2",
      "ValorAluguel3",
      "ValorAluguel5",
      "ValorAluguel6",
      "ValorAluguel7",
      "ValorAluguel8",
      "ValorAluguel_4",
      "ValorDiaria",
    ];

    const obterPrimeiroValorNumerico = (imovel, campos) => {
      for (const campo of campos) {
        const bruto = imovel?.[campo];
        const numero = converterPrecoParaNumero(bruto);
        if (numero > 0) return numero;
      }
      return 0;
    };

    const obterValorPreco = (imovel) => {
      if (sortField !== "price") return 0;

      if (["locacao", "alugar", "aluguel", "locação"].includes(finalidadeToken)) {
        const locacao = obterPrimeiroValorNumerico(imovel, camposPrecoLocacao);
        if (locacao > 0) return locacao;
      }

      const venda = obterPrimeiroValorNumerico(imovel, camposPrecoVenda);
      if (venda > 0) return venda;

      return obterPrimeiroValorNumerico(imovel, camposPrecoLocacao);
    };

    const obterValorArea = (imovel) => {
      if (sortField !== "area") return 0;
      const candidatos = ["AreaPrivativa", "AreaTotal", "Metragem1", "Metragem2"];
      for (const campo of candidatos) {
        const valor = converterAreaParaNumero(imovel?.[campo]);
        if (valor > 0) return valor;
      }
      return converterAreaParaNumero(imovel?.AreaPrivativa || imovel?.AreaTotal);
    };

    const obterValorData = (imovel) => {
      const candidatos = [
        imovel?.DataInclusao,
        imovel?.DataHoraAtualizacao,
        imovel?.updatedAt,
      ];

      for (const entrada of candidatos) {
        if (!entrada) continue;
        const data = new Date(entrada);
        if (!Number.isNaN(data.getTime())) return data.getTime();
      }

      const objectId = imovel?._id;
      if (objectId && typeof objectId.getTimestamp === "function") {
        const data = objectId.getTimestamp();
        if (data instanceof Date && !Number.isNaN(data.getTime())) {
          return data.getTime();
        }
      }

      return 0;
    };

    // Buscar imóveis base
    const imoveisBase = await Imovel.find(filtro);

    // Aplicar filtros de área se fornecidos
    let imoveisFiltradosArea = imoveisBase;
    if (areaMinima || areaMaxima) {
      const areaMinimaNumerica = areaMinima ? parseInt(areaMinima, 10) : null;
      const areaMaximaNumerica = areaMaxima ? parseInt(areaMaxima, 10) : null;

      imoveisFiltradosArea = imoveisBase.filter((imovel) => {
        try {
          const areaImovelNum = converterAreaParaNumero(imovel.AreaPrivativa);

          if (areaMinimaNumerica && areaImovelNum < areaMinimaNumerica) {
            return false;
          }

          if (areaMaximaNumerica && areaImovelNum > areaMaximaNumerica) {
            return false;
          }

          return true;
        } catch (error) {
          console.error(`Erro ao filtrar imóvel por área:`, error);
          return false;
        }
      });
    }

    // Aplicar filtros de preço se fornecidos
    let imoveisFiltrados = imoveisFiltradosArea;
    if (precoMinimo || precoMaximo) {
      const precoMinimoNumerico = precoMinimo ? converterPrecoParaNumero(precoMinimo) : null;
      const precoMaximoNumerico = precoMaximo ? converterPrecoParaNumero(precoMaximo) : null;

      imoveisFiltrados = imoveisFiltradosArea.filter((imovel) => {
        try {
          const precoImovelStr = imovel.ValorAntigo || "0";
          if (precoImovelStr === "0" || precoImovelStr === "") {
            return false;
          }

          const precoImovelNum = converterPrecoParaNumero(precoImovelStr);

          if (precoMinimoNumerico && precoImovelNum < precoMinimoNumerico) {
            return false;
          }

          if (precoMaximoNumerico && precoImovelNum > precoMaximoNumerico) {
            return false;
          }

          return true;
        } catch (error) {
          console.error(`Erro ao filtrar imóvel por preço:`, error);
          return false;
        }
      });
    }

    const computeSortValue = (imovel) => {
      switch (sortField) {
        case "price":
          return obterValorPreco(imovel);
        case "area":
          return obterValorArea(imovel);
        case "date":
        default:
          return obterValorData(imovel);
      }
    };

    const needsPositiveNormalization = sortField === "price" || sortField === "area";

    const normalizeValor = (valor) => {
      if (!needsPositiveNormalization) return valor;
      if (typeof valor !== "number" || Number.isNaN(valor) || valor <= 0) {
        return sortOrder === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
      return valor;
    };

    const sortedImoveis = imoveisFiltrados
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const valorA = normalizeValor(computeSortValue(a.item));
        const valorB = normalizeValor(computeSortValue(b.item));

        const comparePrimario = sortOrder === "asc" ? valorA - valorB : valorB - valorA;
        if (comparePrimario !== 0) {
          return comparePrimario;
        }

        const dataA = obterValorData(a.item);
        const dataB = obterValorData(b.item);
        if (dataA === dataB) {
          return a.index - b.index;
        }
        return sortOrder === "asc" ? dataA - dataB : dataB - dataA;
      })
      .map(({ item }) => item);

    const totalItems = sortedImoveis.length;
    const paginatedImoveis = sortedImoveis.slice(skip, skip + limit);

    return NextResponse.json({
      status: 200,
      data: paginatedImoveis,
      paginacao: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar imóveis com filtros:", error);
    return NextResponse.json({
      status: 500,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
