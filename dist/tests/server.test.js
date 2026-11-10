import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
test('createServer: instantiates McpServer without throwing', () => {
    const server = createServer();
    assert.ok(server, 'Server should instantiate');
});
//# sourceMappingURL=server.test.js.map