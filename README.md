# Chamador de Senhas — Deploy na Vercel

Sistema de chamada de senhas com dois níveis (Prioridade e Comum), painel para
projetor com voz e slides em loop, e painel limitado para atendentes.

## Estrutura

- `index.html` — todo o frontend (início, atendente, painel do projetor, administração)
- `api/estado.js` — API serverless que guarda o estado no Upstash Redis
- `package.json` — única dependência: @upstash/redis

## Passo a passo do deploy

1. **Suba este projeto para um repositório no GitHub** (pode ser privado).

2. **Na Vercel** (vercel.com, conta gratuita serve):
   - "Add New… → Project" e importe o repositório.
   - Framework Preset: **Other**. Não precisa mudar mais nada. Deploy.

3. **Crie o banco (Upstash Redis):**
   - No projeto da Vercel, aba **Storage → Create Database → Upstash (Redis)**.
   - Plano gratuito. Ao criar, a Vercel adiciona sozinha as variáveis de
     ambiente (`KV_REST_API_URL` e `KV_REST_API_TOKEN`) ao projeto.
   - Faça um **Redeploy** (Deployments → ⋯ → Redeploy) para a API enxergar
     as variáveis.

4. **(Opcional) PIN de administração:**
   - Settings → Environment Variables → adicione `SENHA_ADMIN` com um PIN.
   - Com isso, o botão "Zerar dia" passa a exigir esse PIN.

5. Pronto. Compartilhe a URL do projeto:
   - Atendentes abrem e escolhem "Sou atendente" (informam o guichê).
   - O computador do projetor abre "Painel do projetor" e clica em Ativar.
   - A recepção/gestão usa "Administração".

## Observações

- A numeração é gerada no servidor com INCR do Redis (atômico): dois
  atendentes clicando ao mesmo tempo nunca recebem o mesmo número.
- O painel consulta a API a cada 2 segundos; a chamada aparece no projetor
  com até ~2s de atraso.
- Os slides (PDF/imagens) são carregados localmente no computador do painel
  e não sobem para o servidor.
- Não há login: qualquer pessoa com a URL acessa qualquer modo. Para uso
  interno, proteja com o PIN de admin e/ou restrinja o acesso pela rede.
