const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000; // Render usa el 10000 por defecto

app.use(cors());

// --- NUEVA CONFIGURACIÓN ---
// Definimos la ruta donde Render dejará el archivo (en Linux es yt-dlp a secas)
const binaryPath = path.join(__dirname, 'yt-dlp');

// Creamos la instancia directamente. 
// Ya NO usamos initYTDlp() ni downloadFromGithub() aquí adentro.
const ytDlpWrap = new YTDlpWrap(binaryPath);

console.log('Servidor configurado para usar binario en:', binaryPath);

app.get('/extract', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        if (!videoId) return res.status(400).json({ error: 'Falta el videoId' });

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Eliminamos el -f de aquí para que nos traiga TODOS los formatos
        // y nosotros elegimos el mejor en el código de abajo.
        const info = await ytDlpWrap.getVideoInfo([
            videoUrl,
            '--cookies', path.join(__dirname, 'cookies.txt'),
            '--no-warnings',
            '--no-check-certificates',
            '--extractor-args', 'youtube:player_client=android,web'
        ]);

        // Filtramos para obtener solo los que son audio (vcodec === 'none')
        const audioFormats = info.formats.filter(f => 
            f.vcodec === 'none' && f.acodec !== 'none'
        );

        // Ordenamos por bitrate (calidad) de mayor a menor
        const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio) {
            // Si no hay formatos de "solo audio", buscamos el formato que tenga el audio más pesado
            const anyAudio = info.formats.filter(f => f.acodec !== 'none');
            const fallbackAudio = anyAudio.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
            
            if (!fallbackAudio) return res.status(404).json({ error: 'No se encontró audio' });
            
            return res.json({
                audioUrl: fallbackAudio.url,
                title: info.title,
                artist: info.uploader || info.channel,
                thumbnail: info.thumbnail,
                duration: info.duration,
                format: fallbackAudio.ext
            });
        }

        res.json({
            audioUrl: bestAudio.url,
            title: info.title,
            artist: info.uploader || info.channel,
            thumbnail: info.thumbnail,
            duration: info.duration,
            format: bestAudio.ext
        });

    } catch (error) {
        console.error('Error en extracción:', error);
        res.status(500).json({ error: 'Error al extraer', message: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Nota: He quitado el segundo app.listen y los otros endpoints para limpiar el código, 
// pero puedes agregarlos de nuevo si los necesitas.
app.listen(PORT, () => {
    console.log(`YouTube Audio Extractor API corriendo en puerto ${PORT}`);
});






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

/**  Endpoint para streaming directo (opcional)
 * Permite cachear y servir el audio directamente */
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