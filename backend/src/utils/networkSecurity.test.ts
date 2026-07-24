import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createPublicOnlyHttpAgents, isPrivateAddress } from './networkSecurity.js';

test('storage endpoint guard rejects mapped, reserved and multicast addresses', () => {
    for (const address of [
        '::ffff:127.0.0.1',
        '::ffff:169.254.169.254',
        '::127.0.0.1',
        'ff02::1',
        '192.0.2.1',
        '198.51.100.1',
        '203.0.113.1',
        '100.64.0.1',
    ]) {
        assert.equal(isPrivateAddress(address), true, address);
    }
    assert.equal(isPrivateAddress('1.1.1.1'), false);
    assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('connection-time HTTP guard blocks a direct private redirect target before connecting', async () => {
    const { httpAgent } = createPublicOnlyHttpAgents();
    await assert.rejects(
        new Promise<void>((resolve, reject) => {
            const request = http.get('http://127.0.0.1:9/', { agent: httpAgent }, response => {
                response.resume();
                resolve();
            });
            request.on('error', reject);
        }),
        /不允许连接内网/,
    );
    httpAgent.destroy();
});
