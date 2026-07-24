
import http from 'http';
import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'url';

// ============================================
// OneDrive OAuth 授权工具
// 用于获取 AccessToken 和 RefreshToken
// ============================================

const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || '';
if (!CLIENT_ID) throw new Error('Missing ONEDRIVE_CLIENT_ID');
const TENANT_ID = process.env.ONEDRIVE_TENANT_ID || 'common';
const REDIRECT_URI = 'http://localhost:53682/';
const SCOPE = 'Files.ReadWrite.All offline_access';

const AUTH_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&response_mode=query`;

console.log('==========================================');
console.log('OneDrive 国际版授权工具');
console.log('==========================================\n');

console.log('请在浏览器中打开以下链接进行授权:\n');
console.log(AUTH_URL);
console.log('\n等待授权回调...\n');

// 启动本地服务器接收回调
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://localhost:53682`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        console.error('授权失败:', error);
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授权失败</h1><p>授权服务返回了错误，请检查终端中的错误代码。</p>');
        server.close();
        return;
    }

    if (code) {
        console.log('收到授权码，正在换取令牌...\n');

        try {
            // 用授权码换取令牌
            const tokenParams = new URLSearchParams();
            tokenParams.append('client_id', CLIENT_ID);
            tokenParams.append('scope', SCOPE);
            tokenParams.append('code', code);
            tokenParams.append('redirect_uri', REDIRECT_URI);
            tokenParams.append('grant_type', 'authorization_code');

            const tokenRes = await axios.post(
                `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
                tokenParams.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token, refresh_token, expires_in } = tokenRes.data;
            const tokenOutput = process.env.ONEDRIVE_TOKEN_OUTPUT?.trim();
            if (tokenOutput) {
                const outputPath = path.resolve(tokenOutput);
                await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
                await fs.writeFile(
                    outputPath,
                    JSON.stringify({ access_token, refresh_token, expires_in }, null, 2),
                    { encoding: 'utf8', mode: 0o600 },
                );
                await fs.chmod(outputPath, 0o600);
                console.log(`令牌已写入权限受限文件：${outputPath}`);
            }

            console.log('==========================================');
            console.log('✓ 授权成功！');
            console.log('==========================================\n');
            console.log(`令牌已生成（Access Token 有效期 ${expires_in} 秒），不会输出到终端日志。`);
            if (!tokenOutput) {
                console.log('如需保存，请设置 ONEDRIVE_TOKEN_OUTPUT 为权限受控的目标文件后重新授权。');
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <head><title>授权成功</title></head>
                <body style="font-family: Arial; padding: 40px; text-align: center;">
                    <h1 style="color: green;">✓ 授权成功！</h1>
                    <p>令牌不会显示在网页或终端日志中。</p>
                    <p>您可以关闭此窗口。</p>
                </body>
                </html>
            `);

        } catch {
            console.error('换取令牌失败');
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>换取令牌失败</h1><p>请返回终端检查配置后重试。</p>');
        }

        server.close();
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(53682, () => {
    console.log('本地服务器已启动在 http://localhost:53682');
    console.log('等待浏览器授权回调...\n');
});
