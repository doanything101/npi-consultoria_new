// D:\Downloads\npi-consultoria\src\app\api\imoveis\route.js

import { connectToDatabase } from "@/app/lib/mongodb";
import Imovel from "@/app/models/Imovel";
import { NextResponse } from "next/server";
import cache from "@/app/lib/cache";
import ImovelAtivo from "@/app/models/ImovelAtivo";
import ImovelInativo from "@/app/models/ImovelInativo";
import { onPropertyChange } from "@/app/utils/city-sync-helper";

export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    // Parâmetros de paginação e ordenação
    let limit = parseInt(searchParams.get("limit") || "25", 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      limit = 25;
    }

    let page = parseInt(searchParams.get("page") || "1", 10);
    if (!Number.isFinite(page) || page < 1) {
      page = 1;
    }
    const skip = (page - 1) * limit;

    const rawSortField = searchParams.get("sortField") || "date";
    const sortField = ["price", "area", "date"].includes(rawSortField)
      ? rawSortField
      : "date";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Criar uma chave única para o cache baseada nos parâmetros
    const cacheKey = `imoveis_page${page}_limit${limit}_sort${sortField}_${sortOrder}`;

    // Verificar se os dados estão em cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    await connectToDatabase();

    const STATUS_INDISPONIVEIS = ["VENDIDO", "LOCADO", "ALUGADO"];
    const STATUS_INDISPONIVEIS_REGEX = /^(vendido|locado|alugado)$/i;

    const filtro = {
      Status: { $nin: STATUS_INDISPONIVEIS },
      Situacao: { $not: STATUS_INDISPONIVEIS_REGEX },
    };

    // Buscar imóveis agregados garantindo códigos únicos
    const imoveisAgregados = await Imovel.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$Codigo",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);

    const totalItems = imoveisAgregados.length;

    const converterPrecoParaNumero = (valor) => {
      if (!valor) return 0;
      try {
        let valorStr = String(valor);
        valorStr = valorStr.replace(/[R$\s]/g, "");
        valorStr = valorStr.replace(/\./g, "");
        valorStr = valorStr.replace(",", ".");
        return parseFloat(valorStr) || 0;
      } catch (error) {
        console.error(`Erro ao converter preço "${valor}":`, error);
        return 0;
      }
    };

    const converterAreaParaNumero = (valor) => {
      if (!valor) return 0;
      try {
        let valorStr = String(valor);
        valorStr = valorStr
          .replace(/\s*m²?\s*/gi, "")
          .replace(/m2/gi, "")
          .trim();
        valorStr = valorStr.replace(",", ".");
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

    const sortedImoveis = imoveisAgregados
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

    const paginatedImoveis = sortedImoveis.slice(skip, skip + limit);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const response = {
      status: 200,
      data: paginatedImoveis,
      paginacao: {
        totalItems,
        totalPages,
        currentPage: page,
        limit,
      },
    };

    // Armazenar os dados em cache
    cache.set(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Erro ao buscar imóveis:", error);
    return NextResponse.json(
      {
        message: "Erro ao buscar imóveis",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDatabase();

    // Obter os dados do corpo da requisição
    const dadosImovel = await request.json();

    // Verificar se o Codigo foi fornecido
    if (!dadosImovel.Codigo) {
      return NextResponse.json(
        {
          status: 400,
          error: "O campo Codigo é obrigatório",
        },
        { status: 400 }
      );
    }

    // Verificar se o Slug foi fornecido
    if (!dadosImovel.Slug) {
      return NextResponse.json(
        {
          status: 400,
          error: "O campo Slug é obrigatório",
        },
        { status: 400 }
      );
    }

    // Verificar se já existe um imóvel com o mesmo Slug (que não seja o atual)
    const slugExistente = await Imovel.findOne({
      Slug: dadosImovel.Slug,
      Codigo: { $ne: dadosImovel.Codigo },
    });

    if (slugExistente) {
      return NextResponse.json(
        {
          status: 400,
          error: "Já existe um imóvel com este Slug. Por favor, use um Slug único.",
        },
        { status: 400 }
      );
    }

    let imovelSalvo;
    let imovelAtivoSalvo = null;
    let imovelInativoSalvo = null;
    let message = "Imóvel criado com sucesso";

    // Verificar se já existe um imóvel com o mesmo Codigo
    const imovelExistente = await Imovel.findOne({ Codigo: dadosImovel.Codigo });

    // Atualizar ou criar no modelo Imovel principal (independente de estar ativo ou não)
    if (imovelExistente) {
      // Atualizar o imóvel existente
      imovelSalvo = await Imovel.findOneAndUpdate({ Codigo: dadosImovel.Codigo }, dadosImovel, {
        new: true,
        upsert: false,
      });
      message = "Imóvel atualizado com sucesso";
    } else {
      // Criar um novo imóvel
      const novoImovel = new Imovel(dadosImovel);
      imovelSalvo = await novoImovel.save();
    }

    // Gerenciar modelos ImovelAtivo e ImovelInativo baseado no campo Ativo
    if (dadosImovel.Ativo === "Sim") {
      // Se está ativo, deve estar em ImovelAtivo
      const imovelAtivoExistente = await ImovelAtivo.findOne({ Codigo: dadosImovel.Codigo });

      if (imovelAtivoExistente) {
        // Atualizar o imóvel ativo existente
        imovelAtivoSalvo = await ImovelAtivo.findOneAndUpdate(
          { Codigo: dadosImovel.Codigo },
          dadosImovel,
          { new: true, upsert: false }
        );
      } else {
        // Criar um novo imóvel ativo
        const novoImovelAtivo = new ImovelAtivo(dadosImovel);
        imovelAtivoSalvo = await novoImovelAtivo.save();
      }

      // Remover da coleção de inativos se existir
      await ImovelInativo.deleteOne({ Codigo: dadosImovel.Codigo });
    } else if (dadosImovel.Ativo === "Não") {
      // Se está inativo, deve estar em ImovelInativo e não em ImovelAtivo
      const imovelInativoExistente = await ImovelInativo.findOne({ Codigo: dadosImovel.Codigo });

      if (imovelInativoExistente) {
        // Atualizar o imóvel inativo existente
        imovelInativoSalvo = await ImovelInativo.findOneAndUpdate(
          { Codigo: dadosImovel.Codigo },
          dadosImovel,
          { new: true, upsert: false }
        );
      } else {
        // Criar um novo imóvel inativo
        const novoImovelInativo = new ImovelInativo(dadosImovel);
        imovelInativoSalvo = await novoImovelInativo.save();
      }

      // Remover da coleção de ativos se existir
      await ImovelAtivo.deleteOne({ Codigo: dadosImovel.Codigo });
    }

    // Invalidar cache relacionado a imóveis
    const keys = cache.keys();
    keys.forEach((key) => {
      if (key.startsWith("imoveis_")) {
        cache.del(key);
      }
    });

    // Triggerar sincronização de cidades se houver cidade no imóvel
    if (dadosImovel.Cidade) {
      const operation = imovelExistente ? 'update' : 'create';
      onPropertyChange(dadosImovel, operation, 'api');
    }

    return NextResponse.json(
      {
        status: 200,
        success: true,
        message: message,
        data: imovelSalvo,
        imovelAtivo: imovelAtivoSalvo,
        imovelInativo: imovelInativoSalvo,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao processar imóvel:", error);
    return NextResponse.json(
      {
        status: 500,
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    await connectToDatabase();

    // Buscar o imóvel antes de deletar para triggerar sincronização
    const imovelParaDeletar = await Imovel.findOne({ Codigo: id });

    await Imovel.deleteOne({ Codigo: id });
    await ImovelAtivo.deleteOne({ Codigo: id });
    await ImovelInativo.deleteOne({ Codigo: id });

    // Triggerar sincronização se o imóvel tinha cidade
    if (imovelParaDeletar?.Cidade) {
      onPropertyChange(imovelParaDeletar, 'delete', 'api');
    }

    return NextResponse.json({ success: true, message: "Imóvel deletado com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar imóvel:", error);
    return NextResponse.json(
      { success: false, message: "Erro ao deletar imóvel" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    await connectToDatabase();

    // Obter os dados do corpo da requisição
    const dadosImovel = await request.json();

    // Verificar se o Codigo foi fornecido
    if (!dadosImovel.Codigo) {
      return NextResponse.json(
        {
          status: 400,
          error: "O campo Codigo é obrigatório",
        },
        { status: 400 }
      );
    }

    // Verificar se o imóvel existe
    const imovelExistente = await Imovel.findOne({ Codigo: dadosImovel.Codigo });
    if (!imovelExistente) {
      return NextResponse.json(
        {
          status: 404,
          error: "Imóvel não encontrado para atualização",
        },
        { status: 404 }
      );
    }

    // Atualizar o imóvel existente
    const imovelAtualizado = await Imovel.findOneAndUpdate(
      { Codigo: dadosImovel.Codigo },
      dadosImovel,
      { new: true, upsert: false }
    );

    let imovelAtivoAtualizado = null;
    let imovelInativoAtualizado = null;

    // Gerenciar modelos ImovelAtivo e ImovelInativo baseado no campo Ativo
    if (dadosImovel.Ativo === "Sim") {
      // Atualizar ou criar em ImovelAtivo
      const imovelAtivoExistente = await ImovelAtivo.findOne({ Codigo: dadosImovel.Codigo });
      if (imovelAtivoExistente) {
        imovelAtivoAtualizado = await ImovelAtivo.findOneAndUpdate(
          { Codigo: dadosImovel.Codigo },
          dadosImovel,
          { new: true, upsert: false }
        );
      } else {
        const novoImovelAtivo = new ImovelAtivo(dadosImovel);
        imovelAtivoAtualizado = await novoImovelAtivo.save();
      }
      // Remover da coleção de inativos se existir
      await ImovelInativo.deleteOne({ Codigo: dadosImovel.Codigo });
    } else if (dadosImovel.Ativo === "Não") {
      // Atualizar ou criar em ImovelInativo
      const imovelInativoExistente = await ImovelInativo.findOne({ Codigo: dadosImovel.Codigo });
      if (imovelInativoExistente) {
        imovelInativoAtualizado = await ImovelInativo.findOneAndUpdate(
          { Codigo: dadosImovel.Codigo },
          dadosImovel,
          { new: true, upsert: false }
        );
      } else {
        const novoImovelInativo = new ImovelInativo(dadosImovel);
        imovelInativoAtualizado = await novoImovelInativo.save();
      }
      // Remover da coleção de ativos se existir
      await ImovelAtivo.deleteOne({ Codigo: dadosImovel.Codigo });
    }

    // Invalidar cache relacionado a imóveis
    const keys = cache.keys();
    keys.forEach((key) => {
      if (key.startsWith("imoveis_")) {
        cache.del(key);
      }
    });

    // Triggerar sincronização de cidades se houver cidade no imóvel
    if (dadosImovel.Cidade) {
      onPropertyChange(dadosImovel, 'update', 'api');
    }

    return NextResponse.json(
      {
        status: 200,
        success: true,
        message: "Imóvel atualizado com sucesso",
        data: imovelAtualizado,
        imovelAtivo: imovelAtivoAtualizado,
        imovelInativo: imovelInativoAtualizado,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao atualizar imóvel:", error);
    return NextResponse.json(
      {
        status: 500,
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
