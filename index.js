/**
 * Backend para extracción de streams de audio de YouTube
 * Usando yt-dlp (recomendado) o ytdl-core
 * 
 * INSTALACIÓN:
 * npm install express yt-dlp-wrap cors
 * 
 * O alternativa:
 * npm install express ytdl-core cors
 */
const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- CONFIGURACIÓN CRÍTICA ---
// En Render, necesitamos descargar el binario de yt-dlp si no existe
const ytDlpPath = path.join(__dirname, 'yt-dlp.exe'); // o simplemente 'yt-dlp' en Linux
let ytDlpWrap;

async function initYTDlp() {
    // Si estamos en un entorno Linux (como Render), el binario se llama yt-dlp
    const binaryPath = path.join(__dirname, 'yt-dlp');
    
    if (!fs.existsSync(binaryPath)) {
        console.log('Descargando binario de yt-dlp...');
        await YTDlpWrap.downloadFromGithub(binaryPath);
        fs.chmodSync(binaryPath, '755'); // Dar permisos de ejecución
    }
    
    ytDlpWrap = new YTDlpWrap(binaryPath);
    console.log('yt-dlp listo para usar');
}

initYTDlp().catch(console.error);

app.get('/extract', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

        if (!ytDlpWrap) {
            return res.status(503).json({ error: 'Extractor not ready yet' });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Obtener info (usamos argumentos para evitar restricciones de edad/región)
        const info = await ytDlpWrap.getVideoInfo([
            videoUrl,
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats'
        ]);

        const audioFormats = info.formats.filter(f => 
            f.vcodec === 'none' && f.acodec !== 'none'
        );

        const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio) return res.status(404).json({ error: 'No audio found' });

        res.json({
            audioUrl: bestAudio.url,
            title: info.title,
            artist: info.uploader || info.channel,
            thumbnail: info.thumbnail,
            duration: info.duration,
            format: bestAudio.ext
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to extract', message: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/**
 * Endpoint alternativo usando ytdl-core (más simple pero menos confiable)
 */
app.get('/extract-simple', async (req, res) => {
    try {
        const ytdl = require('ytdl-core');
        const videoId = req.query.videoId;
        
        if (!videoId) {
            return res.status(400).json({
                error: 'Missing videoId parameter'
            });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Obtener info
        const info = await ytdl.getInfo(videoUrl);
        
        // Filtrar solo audio
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        
        if (audioFormats.length === 0) {
            return res.status(404).json({
                error: 'No audio stream found'
            });
        }

        // Obtener mejor calidad
        const bestAudio = audioFormats.sort((a, b) => 
            (b.audioBitrate || 0) - (a.audioBitrate || 0)
        )[0];

        const response = {
            audioUrl: bestAudio.url,
            title: info.videoDetails.title,
            artist: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: parseInt(info.videoDetails.lengthSeconds),
            format: bestAudio.container,
            quality: bestAudio.audioBitrate
        };

        res.json(response);

    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({
            error: 'Failed to extract audio',
            message: error.message
        });
    }
});

/**
 * Endpoint de health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'YouTube Audio Extractor',
        timestamp: new Date().toISOString()
    });
});

/**
 * Endpoint para streaming directo (opcional)
 * Permite cachear y servir el audio directamente
 */
app.get('/stream', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        
        if (!videoId) {
            return res.status(400).json({
                error: 'Missing videoId parameter'
            });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Obtener info y stream
        const info = await ytDlpWrap.getVideoInfo(videoUrl);
        const audioFormats = info.formats.filter(f => 
            f.vcodec === 'none' && f.acodec !== 'none'
        );
        const bestAudio = audioFormats.sort((a, b) => 
            (b.abr || 0) - (a.abr || 0)
        )[0];

        if (!bestAudio) {
            return res.status(404).send('No audio found');
        }

        // Redirigir al stream real
        res.redirect(bestAudio.url);

    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).send('Stream failed');
    }
});

// Manejo de errores global
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`YouTube Audio Extractor API running on port ${PORT}`);
    console.log(`Endpoints available:`);
    console.log(`  GET /extract?videoId=XXXX - Extract audio URL`);
    console.log(`  GET /extract-simple?videoId=XXXX - Simple extraction`);
    console.log(`  GET /stream?videoId=XXXX - Direct audio stream`);
    console.log(`  GET /health - Health check`);
});