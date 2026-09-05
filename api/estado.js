import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Faixas fixas das senhas físicas
const MAX_PRIORIDADE = 20;  // senhas 1 a 20
const BASE_COMUM = 20;      // comum começa em 21
const MAX_COMUM = 150;      // até 150

const K = {
  prioridade: 'chamador:prioridade', // última senha prioritária chamada (0 a 20)
  comum: 'chamador:comum',           // última senha comum chamada (20 a 150)
  historico: 'chamador:historico',   // lista de chamadas (mais recente primeiro)
  seq: 'chamador:seq',               // id incremental de cada chamada (fila de anúncios)
  log: 'chamador:log',               // registro permanente p/ relatório (não some no reset)
};

// Grava a chamada no histórico de exibição e no log do relatório
async function registrar(redis, chamada) {
  const linha = JSON.stringify(chamada);
  await redis.lpush(K.historico, linha);
  await redis.ltrim(K.historico, 0, 29);
  await redis.lpush(K.log, linha);
  await redis.ltrim(K.log, 0, 4999); // guarda as últimas 5000 chamadas
}

function parseItem(x) {
  if (typeof x === 'string') {
    try { return JSON.parse(x); } catch { return null; }
  }
  return x;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const [pri, com, hist] = await Promise.all([
        redis.get(K.prioridade),
        redis.get(K.comum),
        redis.lrange(K.historico, 0, 14),
      ]);
      const prioridade = Math.min(Number(pri) || 0, MAX_PRIORIDADE);
      const comum = Math.min(Math.max(Number(com) || BASE_COMUM, BASE_COMUM), MAX_COMUM);
      return res.status(200).json({
        prioridade,
        comum,
        historico: (hist || []).map(parseItem).filter(Boolean),
        pinNecessario: Boolean(process.env.ADMIN_PIN),
        limites: { maxPrioridade: MAX_PRIORIDADE, baseComum: BASE_COMUM, maxComum: MAX_COMUM },
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { acao } = body;

      // ---- Chamar próxima senha ----
      if (acao === 'chamar') {
        const tipo = body.tipo === 'prioridade' ? 'prioridade' : 'comum';
        const guiche = String(body.guiche || '?').slice(0, 20);
        const key = tipo === 'prioridade' ? K.prioridade : K.comum;
        const max = tipo === 'prioridade' ? MAX_PRIORIDADE : MAX_COMUM;

        if (tipo === 'comum') {
          // Garante que o contador comum parte de 20 (primeira chamada = 21)
          await redis.set(K.comum, BASE_COMUM, { nx: true });
        }

        const n = await redis.incr(key); // atômico: nunca duplica sob concorrência
        if (n > max) {
          await redis.set(key, max); // trava no teto da faixa
          return res.status(200).json({ esgotado: true, tipo });
        }

        const id = await redis.incr(K.seq);
        const chamada = { id, senha: n, tipo, guiche, ts: Date.now() };
        await registrar(redis, chamada);
        return res.status(200).json({ ok: true, chamada });
      }

      // ---- Chamar uma senha específica (quem não estava na sala) ----
      if (acao === 'especifica') {
        const senha = Number(body.senha);
        if (!Number.isInteger(senha) || senha < 1 || senha > MAX_COMUM) {
          return res.status(200).json({ ok: false, erro: `Informe uma senha entre 1 e ${MAX_COMUM}.` });
        }
        const guiche = String(body.guiche || '?').slice(0, 20);
        const tipo = senha <= MAX_PRIORIDADE ? 'prioridade' : 'comum';
        const id = await redis.incr(K.seq);
        const chamada = { id, senha, tipo, guiche, ts: Date.now(), avulsa: true };
        await registrar(redis, chamada);
        // não mexe nos contadores: a fila normal segue de onde estava
        return res.status(200).json({ ok: true, chamada });
      }

      // ---- Chamar um intervalo de senhas (lote para a sala de atendimento) ----
      if (acao === 'intervalo') {
        const de = Number(body.de);
        const ate = Number(body.ate);
        if (!Number.isInteger(de) || !Number.isInteger(ate) ||
            de < 1 || ate > MAX_COMUM || de > ate) {
          return res.status(200).json({ ok: false, erro: 'Intervalo inválido (use números de 1 a 150, com início ≤ fim).' });
        }
        const guiche = String(body.guiche || '?').slice(0, 20);
        const msg = String(body.msg || '').slice(0, 120);
        const id = await redis.incr(K.seq);
        const chamada = { id, intervalo: true, de, ate, guiche, msg, ts: Date.now() };
        await registrar(redis, chamada);
        return res.status(200).json({ ok: true, chamada });
      }

      // ---- Repetir última chamada (do guichê, ou geral) ----
      if (acao === 'repetir') {
        const guiche = String(body.guiche || '');
        const hist = (await redis.lrange(K.historico, 0, 29)).map(parseItem).filter(Boolean);
        const ultima = guiche ? hist.find(c => String(c.guiche) === guiche) : hist[0];
        if (!ultima) return res.status(200).json({ ok: false, erro: 'Nenhuma chamada para repetir' });

        const id = await redis.incr(K.seq);
        const chamada = { ...ultima, id, ts: Date.now(), repetida: true };
        // repetição só reanuncia: não entra no log para não contar duas vezes no relatório
        await redis.lpush(K.historico, JSON.stringify(chamada));
        await redis.ltrim(K.historico, 0, 29);
        return res.status(200).json({ ok: true, chamada });
      }

      // ---- Relatório: devolve o log completo para exportar em CSV ----
      if (acao === 'relatorio') {
        const log = (await redis.lrange(K.log, 0, 4999)).map(parseItem).filter(Boolean);
        return res.status(200).json({ ok: true, log });
      }

      // ---- Reset (admin): recomeça o ciclo de senhas ----
      if (acao === 'reset') {
        const pinEnv = process.env.ADMIN_PIN;
        if (pinEnv && String(body.pin || '') !== String(pinEnv)) {
          return res.status(403).json({ erro: 'PIN incorreto' });
        }
        await Promise.all([
          redis.set(K.prioridade, 0),
          redis.set(K.comum, BASE_COMUM),
          redis.del(K.historico),
        ]);
        // K.log é preservado de propósito: o relatório acumula todos os dias
        return res.status(200).json({ ok: true });
      }

      // ---- Apagar o registro do relatório (ação separada e explícita) ----
      if (acao === 'limparLog') {
        const pinEnv = process.env.ADMIN_PIN;
        if (pinEnv && String(body.pin || '') !== String(pinEnv)) {
          return res.status(403).json({ erro: 'PIN incorreto' });
        }
        await redis.del(K.log);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ erro: 'Ação inválida' });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: String((e && e.message) || e) });
  }
}
