const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function downloadYoutubeAudio(videoUrl) {
    const apiKey = process.env.ZERO_APIKEY;
    const apiUrlPrimary = `https://zero-two.online/api/dl/ytaudio5?url=${videoUrl}&apikey=${apiKey}`;
    const apiUrlSecondary = `https://zero-two.online/api/dl/ytaudio?url=${videoUrl}&apikey=${apiKey}`;
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const randomNum = Math.floor(Math.random() * 10000);
    const outputFileName = `output_${date}_${randomNum}.mp3`;
    const outputPath = path.resolve(__dirname, outputFileName);
    try {
        const response = await axios.get(apiUrlPrimary, { responseType: 'arraybuffer' });
        const audioBuffer = response.data;
        fs.writeFileSync(outputPath, audioBuffer);
        return outputPath;
    } catch (error) {
        console.error('Erro ao baixar o áudio com a API primária:', error);
        try {
            const response = await axios.get(apiUrlSecondary, { responseType: 'arraybuffer' });
            const audioBuffer = response.data;
            fs.writeFileSync(outputPath, audioBuffer);
            return outputPath;
        } catch (error) {
            console.error('Erro ao baixar o áudio com a API secundária:', error);
            throw error;
        }
    }
}

async function downloadYoutubeVideo(videoUrl) {
    const apiKey = process.env.ZERO_APIKEY;
    const apiUrlPrimary = `https://zero-two.online/api/dl/ytvideo?url=${videoUrl}&apikey=${apiKey}`;
    const apiUrlSecondary = `https://zero-two.online/api/dl/ytvideo5?url=${videoUrl}&apikey=${apiKey}`;
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const randomNum = Math.floor(Math.random() * 10000);
    const outputFileName = `video_${date}_${randomNum}.mp4`;
    const outputPath = path.resolve(__dirname, outputFileName);
    try {
        const response = await axios.get(apiUrlPrimary, { responseType: 'arraybuffer' });
        const videoBuffer = response.data;
        fs.writeFileSync(outputPath, videoBuffer);
        return outputPath;
    } catch (error) {
        console.error('Erro ao baixar o vídeo com a API primária:', error);
        try {
            const response = await axios.get(apiUrlSecondary, { responseType: 'arraybuffer' });
            const videoBuffer = response.data;
            fs.writeFileSync(outputPath, videoBuffer);
            return outputPath;
        } catch (error) {
            console.error('Erro ao baixar o vídeo com a API secundária:', error);
            throw error;
        }
    }
}

module.exports = {
    downloadYoutubeAudio,
    downloadYoutubeVideo
};
