import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const config = { maxDuration: 25 };

// Lista de reserva, usada só se a consulta ao serviço falhar
const RESERVA = [
  'pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural',
  'pt-BR-ThalitaMultilingualNeural', 'pt-PT-RaquelNeural', 'pt-PT-DuarteNeural',
];

// "pt-BR-FranciscaNeural" → { id: 'francisca', nome: 'Francisca', ... }
function descrever(nomeTecnico, genero) {
  const m = /^([a-z]{2})-([A-Z]{2})-(.+?)(Multilingual)?Neural$/.exec(nomeTecnico);
  if (!m) return null;
  const [, idioma, regiao, curto, multi] = m;
  const nomesRegiao = {
    BR: 'Brasil', PT: 'Portugal', US: 'EUA', GB: 'Reino Unido', FR: 'França',
    DE: 'Alemanha', ES: 'Espanha', IT: 'Itália', JP: 'Japão', CN: 'China',
    KR: 'Coreia', IN: 'Índia', CA: 'Canadá', AU: 'Austrália', NL: 'Holanda',
  };
  return {
    id: curto.toLowerCase() + (idioma === 'pt' ? '' : '-' + idioma + regiao.toLowerCase()),
    nome: curto,
    tecnico: nomeTecnico,
    regiao: nomesRegiao[regiao] || `${idioma}-${regiao}`,
    portugues: idioma === 'pt',
    feminina: genero ? genero.toLowerCase() === 'female' : undefined,
    multilingue: Boolean(multi),
  };
}

let cacheVozes = null;   // a lista muda raramente; guarda entre chamadas

async function listarVozes(incluirMultilingues) {
  if (!cacheVozes) {
    try {
      const tts = new MsEdgeTTS();
      const todas = await tts.getVoices();
      cacheVozes = todas
        .filter(v => {
          const loc = (v.Locale || '').toLowerCase();
          // português nativo, ou vozes multilíngues (falam português também)
          return loc.startsWith('pt') || /MultilingualNeural$/.test(v.ShortName || '');
        })
        .map(v => descrever(v.ShortName, v.Gender))
        .filter(Boolean);
    } catch (e) {
      cacheVozes = RESERVA.map(n => descrever(n)).filter(Boolean);
    }
  }
  return incluirMultilingues
    ? cacheVozes
    : cacheVozes.filter(v => v.portugues);   // só as nativas em português
}

// Aceita tanto o apelido ("francisca") quanto o nome técnico completo
async function resolverVoz(pedida) {
  const vozes = await listarVozes(true);   // busca em todas, inclusive multilíngues
  const alvo = String(pedida || 'francisca').toLowerCase();
  const achada = vozes.find(v => v.id === alvo || v.tecnico.toLowerCase() === alvo);
  return (achada || vozes.find(v => v.id === 'francisca') || vozes[0]).tecnico;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // lista as vozes que o serviço realmente oferece agora
  if (req.method === 'GET' && req.query.listar !== undefined) {
    const vozes = await listarVozes(req.query.multi !== undefined);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ vozes });
  }

  const texto = String(req.query.texto || '').slice(0, 200).trim();
  const vel = String(req.query.vel || '0');   // ex.: "-10" = 10% mais lento
  const tom = String(req.query.tom || '0');

  if (!texto) return res.status(400).json({ erro: 'Texto não informado' });

  try {
    const voz = await resolverVoz(req.query.voz);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const pros = {};
    if (vel !== '0') pros.rate = `${Number(vel) > 0 ? '+' : ''}${Number(vel)}%`;
    if (tom !== '0') pros.pitch = `${Number(tom) > 0 ? '+' : ''}${Number(tom)}Hz`;

    const { audioStream } = await tts.toStream(texto, pros);
    const partes = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', d => partes.push(d));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
      setTimeout(() => reject(new Error('tempo esgotado')), 20000);
    });

    const audio = Buffer.concat(partes);
    if (!audio.length) throw new Error('áudio vazio');

    res.setHeader('Content-Type', 'audio/mpeg');
    // cache longo: a mesma senha nunca precisa ser gerada duas vezes
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(audio);
  } catch (e) {
    // o frontend cai automaticamente para a voz do navegador
    return res.status(503).json({ erro: 'Voz indisponível: ' + (e.message || e) });
  }
}
