"use client";

import { useState, useCallback, useMemo } from "react";
import { atualizarImovel, criarImovel } from "@/app/services";
import { formatterNumber } from "@/app/utils/formatter-number";
import { getTipoEndereco } from "@/app/utils/formater-tipo-address";
import { formatAddress } from "@/app/utils/formatter-address";
import { salvarLog } from "@/app/admin/services/log-service";
import { getCurrentUserAndDate } from "@/app/utils/get-log";

export const useImovelSubmit = (formData, setIsModalOpen, mode = "create", imovelId = null) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validateForm = useMemo(() => {
    return (data) => {
      const requiredFields = [
        { field: "Empreendimento", label: "Empreendimento" },
        { field: "Slug", label: "Slug" },
        { field: "CEP", label: "CEP" },
        { field: "Endereco", label: "Endereço" },
        { field: "Numero", label: "Número" },
        { field: "Bairro", label: "Bairro" },
        { field: "Cidade", label: "Cidade" },
      ];

      const missingFields = requiredFields.filter(
        (item) => !data[item.field] || data[item.field].trim() === ""
      );

      if (missingFields.length > 0) {
        const fieldNames = missingFields.map((f) => f.label).join(", ");
        return {
          isValid: false,
          error: `Campos obrigatórios não preenchidos: ${fieldNames}`,
        };
      }

      const photoCount = data.Foto ? Object.keys(data.Foto).length : 0;
      if (photoCount < 5) {
        return {
          isValid: false,
          error: `É necessário adicionar pelo menos 5 fotos (atualmente: ${photoCount})`,
        };
      }

      return { isValid: true };
    };
  }, []);

  const preparePayload = useMemo(() => {
    return (data) => {
      const fotosArray = data.Foto ? Object.values(data.Foto) : [];

      let videoData = data.Video || {};
      
      if (Array.isArray(data.Video)) {
        const videosObj = {};
        data.Video.forEach((video, index) => {
          if (video.Video) {
            videosObj[index + 1] = { Video: video.Video };
          }
        });
        videoData = videosObj;
      }

      // Converter data do formato brasileiro de volta para ISO se necessário
      let dataHoraAtualizacao = data.DataHoraAtualizacao;
      if (dataHoraAtualizacao && /^\d{2}\/\d{2}\/\d{4}/.test(dataHoraAtualizacao)) {
        // Se está no formato dd/mm/yyyy, converte para ISO
        const [day, month, year] = dataHoraAtualizacao.split('/');
        // Criar a data com UTC para evitar problemas de timezone
        const isoDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
        dataHoraAtualizacao = isoDate;
        console.log('📅 CONVERTENDO DATA PARA ISO:', {
          formatoBrasileiro: data.DataHoraAtualizacao,
          formatoISO: isoDate,
          day, month, year
        });
      } else if (dataHoraAtualizacao && typeof dataHoraAtualizacao === 'string') {
        // Se já está em formato ISO, mantém como está
        console.log('📅 DATA JÁ EM FORMATO ISO:', dataHoraAtualizacao);
      }

      const payload = {
        ...data,
        ValorAntigo: data.ValorAntigo ? formatterNumber(data.ValorAntigo) : undefined,
        TipoEndereco: getTipoEndereco(data.Endereco),
        Endereco: formatAddress(data.Endereco),
        Foto: fotosArray,
        Video: Object.keys(videoData).length > 0 ? videoData : undefined,
        DataHoraAtualizacao: dataHoraAtualizacao // Data convertida para ISO
      };
      
      console.log('📤 PAYLOAD PARA BACKEND:', {
        temDataHoraAtualizacao: !!payload.DataHoraAtualizacao,
        valorDataHoraAtualizacao: payload.DataHoraAtualizacao,
        ValorAntigo: payload.ValorAntigo
      });
      
      return payload;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setIsSaving(true);
      setError("");
      setSuccess("");

      try {
        const validation = validateForm(formData);
        if (!validation.isValid) {
          setError(validation.error);
          setIsSaving(false);
          return;
        }

        const payload = preparePayload(formData);
        
        console.log('📦 PAYLOAD FINAL PARA BACKEND:', {
          temDataHoraAtualizacao: !!payload.DataHoraAtualizacao,
          valorDataHoraAtualizacao: payload.DataHoraAtualizacao,
          ValorAntigo: payload.ValorAntigo,
          Codigo: payload.Codigo
        });

        let result;

        if (formData.Automacao) {
          result = await criarImovel(formData.Codigo, payload);
          if (result && result.success) {
            setSuccess("Imóvel cadastrado com sucesso!");
            setIsModalOpen(true);

            try {
              const { user, timestamp } = await getCurrentUserAndDate();
              await salvarLog({
                user: user.displayName ? user.displayName : "Não Identificado",
                email: user.email,
                data: timestamp.toISOString(),
                action: `Automação:  ${user.email} - criou o imóvel ${formData.Codigo} a partir da automação`,
              });
            } catch (logError) {
              console.error('Erro no log:', logError);
            }
          } else {
            setError(result?.message || "Erro ao criar imóvel");
          }
        } else if (mode === "edit") {
          const id = imovelId || formData.Codigo;
          if (!id) {
            throw new Error('ID do imóvel não encontrado para atualização');
          }
          
          // 🔄 IMPORTANTE: Enviar payload com DataHoraAtualizacao atualizada
          console.log('🚀 ATUALIZANDO IMÓVEL:', {
            id,
            DataHoraAtualizacao: payload.DataHoraAtualizacao,
            ValorAntigo: payload.ValorAntigo
          });
          
          result = await atualizarImovel(id, payload);

          try {
            const { user, timestamp } = await getCurrentUserAndDate();
            await salvarLog({
              user: user.displayName ? user.displayName : "Não Identificado",
              email: user.email,
              data: timestamp.toISOString(),
              action: `Usuário ${user.email} atualizou o imóvel ${formData.Codigo}`,
            });
          } catch (logError) {
            console.error('Erro no log:', logError);
          }

          if (result && result.success) {
            setSuccess("Imóvel atualizado com sucesso!");
            setIsModalOpen(true);
          } else {
            setError(result?.message || "Erro ao atualizar imóvel");
          }
        } else {
          result = await criarImovel(formData.Codigo, payload);

          if (result && result.success) {
            setSuccess("Imóvel cadastrado com sucesso!");
            setIsModalOpen(true);
            try {
              const { user, timestamp } = await getCurrentUserAndDate();
              await salvarLog({
                user: user.displayName,
                email: user.email,
                data: timestamp.toISOString(),
                action: `Usuário ${user.email} criou o imóvel ${formData.Codigo}`,
              });
            } catch (logError) {
              console.error('Erro no log:', logError);
            }
          } else {
            setError(result?.message || "Erro ao cadastrar imóvel");
          }
        }
      } catch (error) {
        console.error(`Erro ao ${mode === "edit" ? "atualizar" : "cadastrar"} imóvel:`, error);
        setError(`Ocorreu um erro ao ${mode === "edit" ? "atualizar" : "cadastrar"} o imóvel: ${error.message}`);
      } finally {
        setIsSaving(false);
      }
    },
    [formData, setIsModalOpen, validateForm, preparePayload, mode, imovelId]
  );

  return {
    handleSubmit,
    isSaving,
    error,
    success,
    setError,
    setSuccess,
  };
};

export default useImovelSubmit;
