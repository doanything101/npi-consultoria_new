import { formatterValue } from "@/app/utils/formatter-value";

const normalizeString = (value) =>
  typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const isValidNumberLike = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "0") return false;
    const digits = trimmed.replace(/[^0-9]/g, "");
    return digits.length > 0 && Number(digits) > 0;
  }
  return false;
};

const sanitizeToNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    return digits ? Number(digits) : 0;
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : 0;
};

const extractValorAluguel = (imovel) => {
  const valor = imovel?.ValorAluguelSite ?? imovel?.ValorLocacao ?? null;
  if (!isValidNumberLike(valor)) return null;
  return valor;
};

const formatValorAntigo = (valor) => {
  if (!isValidNumberLike(valor)) return null;
  const raw = String(valor).replace(/,\d{2}$/, "");
  const clean = raw.startsWith("R$") ? raw.replace(/^R\$\s*/, "") : raw;
  return `R$ ${clean}`.trim();
};

export const isLocacaoStatus = (status) => {
  const normalized = normalizeString(status);
  return normalized === "locacao" || normalized === "aluguel";
};

export const getImovelValorPrincipal = (imovel) => {
  if (!imovel) return "Consultar Disponibilidade";

  const aluguel = extractValorAluguel(imovel);
  if (isLocacaoStatus(imovel.Status) && aluguel !== null) {
    return formatterValue(aluguel);
  }

  const valorAntigoFormatado = formatValorAntigo(imovel.ValorAntigo);
  if (valorAntigoFormatado) return valorAntigoFormatado;

  if (isValidNumberLike(imovel.ValorVenda)) {
    return formatterValue(imovel.ValorVenda);
  }

  if (isValidNumberLike(imovel.ValorLocacao)) {
    return formatterValue(imovel.ValorLocacao);
  }

  return "Consultar Disponibilidade";
};

export const getImovelValorNumerico = (imovel) => {
  if (!imovel) return 0;

  const aluguel = extractValorAluguel(imovel);
  if (isLocacaoStatus(imovel.Status) && aluguel !== null) {
    return sanitizeToNumber(aluguel);
  }

  if (isValidNumberLike(imovel.ValorAntigo)) {
    return sanitizeToNumber(imovel.ValorAntigo);
  }

  if (isValidNumberLike(imovel.ValorVenda)) {
    return sanitizeToNumber(imovel.ValorVenda);
  }

  if (isValidNumberLike(imovel.ValorLocacao)) {
    return sanitizeToNumber(imovel.ValorLocacao);
  }

  return 0;
};
