import { Redis } from '@upstash/redis';

// Aceita tanto as variáveis criadas pela integração da Vercel (KV_*)
// quanto as padrão do Upstash (UPSTASH_*)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const K = {
  emitP: 'senha:emitP',
  emitC: 'senha:emitC',
  chamP: 'senha:chamP',
  chamC: 'senha:chamC',
  ultima: 'senha:ultima',
  hist: 'senha:hist',
};

async function estadoAtual() {
  const [emitP, emitC, chamP, chamC, ultima, hist] = await Promise.all([
    redis.get(K.emitP), redis.get(K.emitC),
    redis.get(K.chamP), redis.get(K.chamC),
    redis.get(K.ultima),
    redis.lrange(K.hist, 0, 4),
  ]);
  return {
    emitP: Number(emitP) || 0,
    emitC: Number(emitC) || 0,
    chamP: Number(chamP) || 0,
    chamC: Number(chamC) || 0,
    ultima: ultima || null,
    hist: (hist || []).map(h => (typeof h === 'string' ? JSON.parse(h) : h)),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await estadoAtual());
    }

    if (req.method === 'POST') {
      const { action, tipo, guiche, chamada, pin } = req.body || {};

      if (action === 'chamar') {
        if (tipo !== 'P' && tipo !== 'C') return res.status(400).json({ erro: 'tipo inválido' });
        // INCR é atômico: dois atendentes nunca recebem o mesmo número
        const num = await redis.incr(tipo === 'P' ? K.chamP : K.chamC);
        // garante que a "emissão" acompanha caso não usem a recepção
        const emitKey = tipo === 'P' ? K.emitP : K.emitC;
        const emit = Number(await redis.get(emitKey)) || 0;
        if (emit < num) await redis.set(emitKey, num);

        const ch = { tipo, num, guiche: Number(guiche) || 1, ts: Date.now() };
        await Promise.all([
          redis.set(K.ultima, ch),
          redis.lpush(K.hist, JSON.stringify(ch)),
        ]);
        await redis.ltrim(K.hist, 0, 4);
        return res.status(200).json({ ok: true, chamada: ch, estado: await estadoAtual() });
      }

      if (action === 'repetir') {
        if (!chamada || !chamada.tipo || !chamada.num) {
          return res.status(400).json({ erro: 'chamada inválida' });
        }
        const ch = { ...chamada, ts: Date.now() }; // novo ts faz o painel reanunciar
        await redis.set(K.ultima, ch);
        return res.status(200).json({ ok: true, chamada: ch });
      }

      if (action === 'emitir') {
        if (tipo !== 'P' && tipo !== 'C') return res.status(400).json({ erro: 'tipo inválido' });
        await redis.incr(tipo === 'P' ? K.emitP : K.emitC);
        return res.status(200).json({ ok: true, estado: await estadoAtual() });
      }

      if (action === 'zerar') {
        // Proteção opcional: defina a variável de ambiente SENHA_ADMIN na Vercel
        // e o "zerar" passa a exigir esse PIN.
        if (process.env.SENHA_ADMIN && pin !== process.env.SENHA_ADMIN) {
          return res.status(403).json({ erro: 'PIN incorreto' });
        }
        await redis.del(K.emitP, K.emitC, K.chamP, K.chamC, K.ultima, K.hist);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ erro: 'ação desconhecida' });
    }

    return res.status(405).json({ erro: 'método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'falha no servidor: ' + (e.message || e) });
  }
}
