"use client";
import { memo } from "react";
import FormField from "./FormField";

// List of required fields
export const REQUIRED_FIELDS = [
  "Empreendimento",
  "Slug",
  "CEP",
  "Endereco",
  "Numero",
  "Bairro",
  "Cidade",
];

// 🎯 FUNÇÃO MELHORADA: Formatar data de atualização
const formatDataAtualizacao = (value) => {
  // Se não tem valor, retorna string vazia
  if (!value || value === null || value === undefined || value === '') {
    return '';
  }
  
  try {
    // Se já está no formato DD/MM/YYYY, retorna como está
    if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(value)) {
      return value;
    }
    
    // Tenta criar uma data a partir do valor
    const date = new Date(value);
    
    // Verifica se é uma data válida
    if (isNaN(date.getTime())) {
      // Se não é uma data válida mas tem valor, tenta formato MySQL
      if (typeof value === 'string' && value.includes('-')) {
        // Tenta converter formato MySQL para JavaScript
        const mysqlDate = value.replace(' ', 'T');
        const date2 = new Date(mysqlDate);
        
        if (!isNaN(date2.getTime())) {
          const dia = date2.getDate().toString().padStart(2, '0');
          const mes = (date2.getMonth() + 1).toString().padStart(2, '0');
          const ano = date2.getFullYear();
          
          // Retorna apenas DD/MM/YYYY sem horário para melhor visualização
          return `${dia}/${mes}/${ano}`;
        }
      }
      return value; // Retorna o valor original se não conseguir formatar
    }
    
    // Formata a data no padrão brasileiro
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const ano = date.getFullYear();
    
    // Retorna apenas DD/MM/YYYY sem horário para melhor visualização
    return `${dia}/${mes}/${ano}`;
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    // Retorna string vazia em caso de erro
    return '';
  }
};

const FieldGroup = ({ fields, formData, displayValues, onChange, validation = {} }) => {
  const getFieldValue = (field) => {
    // 🔄 TRATAMENTO ESPECIAL PARA DATA - Agora busca DataHoraAtualizacao
    if (field.name === "DataHoraAtualizacao") {
      // Busca em vários lugares possíveis
      const dataValue = formData.DataHoraAtualizacao || 
                       formData.DataAtualizacao || 
                       formData.dataHoraAtualizacao ||
                       formData.dataAtualizacao ||
                       '';
      
      console.log('🔍 DEBUG DataHoraAtualizacao:', {
        fieldName: field.name,
        rawValue: dataValue,
        formDataKeys: Object.keys(formData).filter(k => k.toLowerCase().includes('data'))
      });
      
      return formatDataAtualizacao(dataValue);
    }
    
    // Tratamento especial para campo de vídeo
    if (field.name === "Video.1.Video") {
      return formData?.Video?.[1]?.Video || "";
    }
    
    // Para campos monetários, usar displayValues se disponível
    if (field.isMonetary && displayValues?.[field.name]) {
      return displayValues[field.name];
    }
    
    return formData[field.name] || "";
  };
  
  const isFieldValid = (fieldName) => {
    // If we don't have validation data, assume it's valid
    if (!validation.fieldValidation) return true;
    return validation.fieldValidation[fieldName] !== false;
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map((field, index) => (
        <FormField
          key={`${field.name}-${index}`}
          field={field}
          value={getFieldValue(field)}
          displayValue={field.isMonetary ? displayValues[field.name] : undefined}
          onChange={onChange}
          fullWidth={field.type === "textarea"}
          isRequired={REQUIRED_FIELDS.includes(field.name)}
          isValid={isFieldValid(field.name)}
        />
      ))}
    </div>
  );
};

export default memo(FieldGroup);
