# Configuração do Google Maps

## Map ID para AdvancedMarker

Este projeto usa `@vis.gl/react-google-maps` com `AdvancedMarker`, que requer um **Map ID** do Google Cloud Console.

### Como configurar:

1. **Acesse o Google Cloud Console:**
   - URL: https://console.cloud.google.com/google/maps-apis/studio/maps
   - Faça login com sua conta Google

2. **Crie um novo Map ID:**
   - Clique em **"Create Map ID"** ou **"+ Criar ID do mapa"**
   - Dê um nome descritivo (ex: "NPI Imóveis - Produção")
   - Selecione tipo: **JavaScript**
   - Clique em **Criar**

3. **Copie o Map ID gerado:**
   - Após criar, você verá um ID no formato: `abc123def456`
   - Copie esse ID

4. **Configure no projeto:**
   - Crie ou edite o arquivo `.env.local` na raiz do projeto
   - Adicione a linha:
     ```
     NEXT_PUBLIC_GOOGLE_MAP_ID=seu_map_id_aqui
     ```

5. **Reinicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

### Exemplo de `.env.local`:

```env
# Google Maps API Key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...

# Google Map ID (obrigatório para AdvancedMarker)
NEXT_PUBLIC_GOOGLE_MAP_ID=abc123def456

# Outras variáveis...
```

### Troubleshooting:

**Erro: "O mapa é inicializado sem um ID de mapa válido"**
- Verifique se você criou o Map ID no tipo **JavaScript** (não Mobile ou Static)
- Confirme que a variável `NEXT_PUBLIC_GOOGLE_MAP_ID` está no `.env.local`
- Reinicie o servidor após adicionar a variável

**Map ID temporário (DEMO_MAP_ID):**
- O projeto usa um ID temporário para desenvolvimento
- Para produção, você **DEVE** configurar um Map ID real
- Consulte o aviso no console do navegador

### Links úteis:

- [Google Maps Platform - Map IDs](https://developers.google.com/maps/documentation/javascript/get-api-key#map-ids)
- [@vis.gl/react-google-maps Docs](https://visgl.github.io/react-google-maps/)
- [Google Cloud Console - Maps](https://console.cloud.google.com/google/maps-apis/studio/maps)
