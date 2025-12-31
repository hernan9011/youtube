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
const app = express();
const PORT = process.env.PORT || 3000;
// Habilitar CORS para peticiones desde Android
app.use(cors());

// Inicializar yt-dlp
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpPath = require('ytdl-core');
const ytDlpWrap = new YTDlpWrap(ytDlpPath);

/**
 * Endpoint principal: /extract?videoId=XXXX
 * Retorna URL del stream de audio y metadata
 */
app.get('/extract', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        
        if (!videoId) {
            return res.status(400).json({
                error: 'Missing videoId parameter'
            });
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`Extracting audio for: ${videoId}`);

        // Obtener información del video
        const info = await ytDlpWrap.getVideoInfo(videoUrl);
        
        // Encontrar el mejor formato de audio
        const audioFormats = info.formats.filter(f => 
            f.vcodec === 'none' && f.acodec !== 'none'
        );
        
        // Preferir m4a o webm de alta calidad
        const bestAudio = audioFormats.sort((a, b) => 
            (b.abr || 0) - (a.abr || 0)
        )[0];

        if (!bestAudio) {
            return res.status(404).json({
                error: 'No audio stream found'
            });
        }

        // Construir respuesta
        const response = {
            audioUrl: bestAudio.url,
            title: info.title || 'YouTube Audio',
            artist: info.uploader || info.channel || 'Unknown',
            thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: info.duration || 0,
            format: bestAudio.ext,
            quality: bestAudio.abr || 'unknown'
        };

        console.log(`Audio extracted successfully: ${response.title}`);
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