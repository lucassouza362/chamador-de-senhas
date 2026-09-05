import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Vozes neurais (não dependem do Windows nem do navegador)
const VOZES = {
  // Brasil — femininas
  francisca:'pt-BR-FranciscaNeural',
  thalita:  'pt-BR-ThalitaMultilingualNeural',
  brenda:   'pt-BR-BrendaNeural',
  elza:     'pt-BR-ElzaNeural',
  giovanna: 'pt-BR-GiovannaNeural',
  leila:    'pt-BR-LeilaNeural',
  leticia:  'pt-BR-LeticiaNeural',
  manuela:  'pt-BR-ManuelaNeural',
  yara:     'pt-BR-YaraNeural',
  // Brasil — masculinas
  antonio:  'pt-BR-AntonioNeural',
  donato:   'pt-BR-DonatoNeural',
  fabio:    'pt-BR-FabioNeural',
  humberto: 'pt-BR-HumbertoNeural',
  julio:    'pt-BR-JulioNeural',
  nicolau:  'pt-BR-NicolauNeural',
  valerio:  'pt-BR-ValerioNeural',
  // Portugal
  raquel:   'pt-PT-RaquelNeural',
  fernanda: 'pt-PT-FernandaNeural',
  duarte:   'pt-PT-DuarteNeural',
};

const FEMININAS = ['francisca','thalita','brenda','elza','giovanna','leila','leticia','manuela','yara','raquel','fernanda'];
const PORTUGAL  = ['raquel','fernanda','duarte'];

export const config = { maxDuration: 25 };

export default async function handler(req, res) {
  // lista as vozes disponíveis para o seletor da interface
  if (req.method === 'GET' && req.query.listar !== undefined) {
    return res.status(200).json({
      vozes: Object.keys(VOZES).map(id => ({
        id,
        nome: id.charAt(0).toUpperCase() + id.slice(1),
        feminina: FEMININAS.includes(id),
        portugal: PORTUGAL.includes(id),
      })),
    });
  }

  const texto = String(req.query.texto || '').slice(0, 200).trim();
  const vozId = String(req.query.voz || 'francisca').toLowerCase();
  const vel = String(req.query.vel || '0');   // ex.: "-10" = 10% mais lento
  const tom = String(req.query.tom || '0');

  if (!texto) return res.status(400).json({ erro: 'Texto não informado' });
  const voz = VOZES[vozId] || VOZES.francisca;

  try {
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(audio);
  } catch (e) {
    // o frontend cai automaticamente para a voz do navegador
    return res.status(503).json({ erro: 'Voz da internet indisponível: ' + (e.message || e) });
  }
}
