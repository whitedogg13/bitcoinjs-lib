"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mocha_1 = require("mocha");
const __1 = require("..");
const fixtures = require("./fixtures/crypto.json");
mocha_1.describe('crypto', () => {
    ['hash160', 'hash256', 'ripemd160', 'sha1', 'sha256'].forEach(algorithm => {
        mocha_1.describe(algorithm, () => {
            fixtures.forEach(f => {
                const fn = __1.crypto[algorithm];
                const expected = f[algorithm];
                mocha_1.it('returns ' + expected + ' for ' + f.hex, () => {
                    const data = Buffer.from(f.hex, 'hex');
                    const actual = fn(data).toString('hex');
                    assert.strictEqual(actual, expected);
                });
            });
        });
    });
});
