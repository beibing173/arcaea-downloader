const https = require('https');
const fs = require('fs');
const path = require('path');
const ProgressBar = require('progress');
const config = require('./config.json');

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        
        https.get(url, (response) => {
            const totalSize = parseInt(response.headers['content-length'], 10);
            const bar = new ProgressBar('下载进度 [:bar] :percent :etas', {
                complete: '=',
                incomplete: ' ',
                width: 50,
                total: totalSize
            });

            response.on('data', (chunk) => {
                bar.tick(chunk.length);
            });

            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('\n下载完成！');
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

async function checkVersion() {
    return new Promise((resolve, reject) => {
        https.get(config.apiUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function checkAndDownload() {
    try {
        // 获取API数据
        const apiData = await checkVersion();

        // 验证API响应
        if (!apiData.success || !apiData.value || !apiData.value.url) {
            throw new Error('API返回数据格式不正确或未找到下载URL');
        }

        const newVersion = apiData.value.version;
        const downloadUrl = apiData.value.url;
        const fileName = `arcaea_${newVersion}.apk`;
        const savePath = path.join(config.downloadPath, fileName);

        // 检查是否已存在相同版本
        if (fs.existsSync(savePath)) {
            console.log(`版本 ${newVersion} 已存在，无需下载`);
            return;
        }

        console.log(`发现新版本: ${newVersion}`);
        console.log(`开始下载 Arcaea v${newVersion}...`);
        console.log(`下载地址: ${downloadUrl}`);
        console.log(`保存位置: ${savePath}`);
        
        await downloadFile(downloadUrl, savePath);
        
        console.log('下载完成！');

    } catch (error) {
        console.error('检查更新时出现错误:', error.message);
    }
}

async function main() {
    try {
        // 确保下载目录存在
        if (!fs.existsSync(config.downloadPath)) {
            fs.mkdirSync(config.downloadPath, { recursive: true });
        }

        // 首次执行检查
        await checkAndDownload();

        // 如果启用了自动检查
        if (config.autoCheck?.enabled) {
            const intervalInMinutes = config.autoCheck.interval / 60000;
            console.log(`\n自动检查已启用，每 ${intervalInMinutes} 分钟检查一次更新`);
            console.log(`按 Ctrl+C 可退出程序\n`);
            
            setInterval(checkAndDownload, config.autoCheck.interval);
        }

    } catch (error) {
        console.error('程序运行出错:', error.message);
    }
}

// 启动程序
main();