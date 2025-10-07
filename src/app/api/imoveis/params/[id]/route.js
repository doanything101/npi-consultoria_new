import { connectToDatabase } from "@/app/lib/mongodb";
import Imovel from "@/app/models/Imovel";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const { id } = params;
  const { searchParams } = request.nextUrl;

  // Extrair os parâmetros da query
  const categoria = searchParams.get("categoria");
  const cidade = searchParams.get("cidade");
  // Obter múltiplos bairros da query
  const bairros = searchParams.getAll("bairros");
  const quartos = searchParams.get("quartos");
  const banheiros = searchParams.get("banheiros");
  const vagas = searchParams.get("vagas");

  // Parâmetros de paginação
  const limit = parseInt(searchParams.get("limit") || "12", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const skip = (page - 1) * limit;

  try {
    await connectToDatabase();

    // Construir o objeto de filtro
    const filtro = {};

    // Adicionar filtros apenas se os parâmetros estiverem presentes
    if (categoria) filtro.Categoria = categoria;
    if (cidade) filtro.Cidade = cidade;

    // Tratamento específico para os bairros
    if (bairros && bairros.length > 0) {
      // Usar operador $in para buscar em múltiplos bairros
      filtro.BairroComercial = { $in: bairros };
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

    // Contar o total de documentos que correspondem ao filtro
    const totalItems = await Imovel.countDocuments(filtro);

    // Calcular o total de páginas
    const totalPages = Math.ceil(totalItems / limit);

    // Buscar imóveis com os filtros aplicados, com paginação
    const imoveis = await Imovel.find(filtro).skip(skip).limit(limit);

    return NextResponse.json({
      status: 200,
      data: imoveis,
      filtrosAplicados: filtro,
      paginacao: {
        totalItems,
        totalPages,
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
