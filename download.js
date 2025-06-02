const https = require('https');
const fs = require('fs');
const path = require('path');
const ProgressBar = require('progress');
const config = require('./config.json');

// 设置控制台输出编码为 UTF-8
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');

async function downloadFile(url, destPath) {
    let file;
    return new Promise((resolve, reject) => {
        file = fs.createWriteStream(destPath);
        
        const request = https.get(url, (response) => {
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
                file.close(() => resolve());
            });

            file.on('error', (err) => {
                file.close();
                fs.unlink(destPath, () => reject(err));
            });

        }).on('error', (err) => {
            if(file) {
                file.close();
                fs.unlink(destPath, () => reject(err));
            } else {
                reject(err);
            }
        });

        // 设置请求超时
        request.setTimeout(30000);
        request.on('timeout', () => {
            request.destroy();
            if(file) {
                file.close();
                fs.unlink(destPath, () => reject(new Error('下载超时')));
            } else {
                reject(new Error('下载超时'));
            }
        });
    });
}

async function checkVersion(apiUrl) {
    return new Promise((resolve, reject) => {
        const request = https.get(apiUrl, (res) => {
            let data = '';
            
            // 设置编码
            res.setEncoding('utf8');
            
            res.on('data', (chunk) => data += chunk);
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (e) {
                    reject(e);
                } finally {
                    // 确保响应流被关闭
                    res.destroy();
                }
            });

            res.on('error', (error) => {
                res.destroy();
                reject(error);
            });

        });

        // 设置请求超时
        request.setTimeout(30000); // 30秒超时
        
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('请求超时'));
        });

        request.on('error', (error) => {
            request.destroy();
            reject(error);
        });
    });
}

async function tryDownloadWithAllAPIs(version, destPath, apiIndex = 0) {
    if (apiIndex >= config.apiUrls.length) {
        throw new Error('所有API源都已尝试完毕，下载失败');
    }

    try {
        // 获取新的API数据
        const apiData = await checkVersion(config.apiUrls[apiIndex]);
        
        if (!apiData.success || !apiData.value || !apiData.value.url) {
            throw new Error('API返回数据格式不正确');
        }

        // 验证版本匹配
        if (apiData.value.version !== version) {
            throw new Error('API返回版本不匹配');
        }

        console.log(`尝试从API源 ${apiIndex + 1} 下载...`);
        try {
            await downloadFile(apiData.value.url, destPath);
            return true;
        } catch (downloadError) {
            console.log(`\n下载失败: ${downloadError.message}`);
            return tryDownloadWithAllAPIs(version, destPath, apiIndex + 1);
        }
    } catch (error) {
        console.log(`\nAPI源 ${apiIndex + 1} 失败: ${error.message}`);
        return tryDownloadWithAllAPIs(version, destPath, apiIndex + 1);
    }
}

async function checkAndDownload() {
    try {
        // 从第一个API获取数据
        const apiData = await checkVersion(config.apiUrls[0]);

        // 验证API响应
        if (!apiData.success || !apiData.value || !apiData.value.url) {
            throw new Error('API返回数据格式不正确或未找到下载URL');
        }

        const newVersion = apiData.value.version;
        const fileName = `arcaea_${newVersion}.apk`;

        // 规范化路径处理
        const normalizedPath = config.downloadPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
        const savePath = path.join(normalizedPath, fileName);

        // 检查是否已存在相同版本
        if (fs.existsSync(savePath)) {
            console.log(`版本 ${newVersion} 已存在，无需下载`);
            return;
        }

        console.log(`发现新版本: ${newVersion}`);
        console.log(`开始下载 Arcaea v${newVersion}...`);
        
        // 尝试使用所有API源下载
        await tryDownloadWithAllAPIs(newVersion, savePath);

    } catch (error) {
        console.error('检查更新时出现错误:', error.message);
    }
}

async function main() {
    try {
        // 确保下载目录存在
        const normalizedPath = config.downloadPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
        if (!fs.existsSync(normalizedPath)) {
            fs.mkdirSync(normalizedPath, { recursive: true });
        }

        // 首次执行检查
        await checkAndDownload();

        // 如果启用了自动检查
        if (config.autoCheck?.enabled) {
            const intervalInSeconds = config.autoCheck.interval / 1000;
            console.log(`\n自动检查已启用，每 ${intervalInSeconds} 秒检查一次更新`);
            console.log(`按 Ctrl+C 可退出程序\n`);
            
            setInterval(checkAndDownload, config.autoCheck.interval);
        }

    } catch (error) {
        console.error('程序运行出错:', error.message);
    }
}

// 启动程序
main();
